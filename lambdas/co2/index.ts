'use strict';

import { Callback, SNSEvent, SNSHandler } from 'aws-lambda';
import CloudWatch = require('aws-sdk/clients/cloudwatch');
import S3 = require('aws-sdk/clients/s3');

import * as https from 'https';
import * as url from 'url';
import { promisify } from 'util';

import { PostResponse, SlackMessageAttachment, SlackMessageRequest, SNSMessage } from './types';
import { defer, formattedDateStringForKey } from './utils';

const slackChannel = process.env.SLACK_CHANNEL!;
const hookUrl = process.env.SLACK_HOOK_URL!;
const imageBucketName = process.env.IMAGE_BUCKET_NAME!;

function post(requestUrl: string, requestBody: object): Promise<PostResponse> {
  const { promise, resolve, reject } = defer<PostResponse>();
  const body = JSON.stringify(requestBody);
  const options: https.RequestOptions = url.parse(requestUrl);
  options.method = 'POST';
  options.headers = {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  };

  const postReq = https.request(options, res => {
    const chunks: string[] = [];
    res.setEncoding('utf8');
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
      resolve({
        body: chunks.join(''),
        statusCode: res.statusCode!,
        statusMessage: res.statusMessage,
      });
    });
    res.on('error', reject);
    return res;
  });

  postReq.write(body);
  postReq.end();

  return promise;
}

function postMessage(message: SlackMessageRequest): Promise<PostResponse> {
  return post(hookUrl, message);
}

// tslint:disable: object-literal-sort-keys
// https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/APIReference/API_GetMetricWidgetImage.html
const mkWidgetRequest = (metrics: Array<{ namespace: string; metricName: string }>) => ({
  width: 600,
  height: 400,
  start: '-PT2H',
  end: 'PT0H',
  timezone: '+0900',
  view: 'timeSeries',
  stacked: false,
  stat: 'Average',
  metrics: metrics.map(({ namespace, metricName }) => [namespace, metricName]),
  period: 300,
  annotations: {
    horizontal: [
      {
        color: '#f0ad4e',
        value: 1000,
      },
      {
        color: '#d9534f',
        value: 1500,
      },
    ],
  },
});
// tslint:enable: object-literal-sort-keys

function mkSlackMessage(message: SNSMessage, imageUrl: string): SlackMessageRequest {
  const alarmName = message.AlarmName;
  const newState = message.NewStateValue;
  const reason = message.NewStateReason;

  let text;
  const iconEmoji = ':thinking_face:';
  const attachment: SlackMessageAttachment = { image_url: imageUrl };

  switch (newState) {
    case 'OK':
      attachment.text = '二酸化炭素濃度は正常だよ';
      attachment.color = 'good';
      break;
    case 'ALARM':
      attachment.text = '二酸化炭素濃度が高いよ';
      attachment.color = 'danger';
      break;
    case 'INSUFFICIENT_DATA':
      text = '@watiko';
      attachment.text = '二酸化炭素濃度のデータがないみたいだよ';
      // 指定しないと灰色になるけど明示した方がいいかも
      // attachment.color = 'gray';
      break;
    default:
      text = `${alarmName} state is now ${newState}: ${reason}`;
      console.error(`Unexpected State: ${newState}, reason: ${reason}`);
  }

  return {
    attachments: [attachment],
    channel: slackChannel,
    icon_emoji: iconEmoji,
    link_names: true,
    text,
    username: 'CO2 Monitor',
  };
}

function processEvent(event: SNSEvent, callback: Callback) {
  const message: SNSMessage = JSON.parse(event.Records[0].Sns.Message);
  const timestamp = event.Records[0].Sns.Timestamp;

  const metric = { metricName: message.Trigger.MetricName, namespace: message.Trigger.Namespace };

  const cloudwatch = new CloudWatch();
  const getMetricWidgetImageAsync = promisify<
    CloudWatch.Types.GetMetricWidgetImageInput,
    CloudWatch.Types.GetMetricWidgetImageOutput
  >(cloudwatch.getMetricWidgetImage.bind(cloudwatch));

  const s3 = new S3();
  const s3PutObjectAsync = promisify<S3.Types.PutObjectRequest, S3.Types.PutObjectOutput>(
    s3.putObject.bind(s3),
  );

  const imageKey = `${message.AlarmName}/${formattedDateStringForKey(timestamp)}-${
    message.NewStateValue
  }.png`;
  const imageUrl = `https://${imageBucketName}.s3.amazonaws.com/${imageKey}`;

  const slackMessage = mkSlackMessage(message, imageUrl);
  const widgetRequest = JSON.stringify(mkWidgetRequest([metric]));

  Promise.resolve()
    .then(() =>
      getMetricWidgetImageAsync({
        MetricWidget: widgetRequest,
      }),
    )
    .then(widgetOutput => new Buffer(widgetOutput.MetricWidgetImage as string, 'base64'))
    .then(widgetImage => {
      return s3PutObjectAsync({
        ACL: 'public-read', // presigned url は面倒なのでサボっている
        Body: widgetImage,
        Bucket: imageBucketName,
        Key: imageKey,
      });
    })
    .then(() => postMessage(slackMessage))
    .then(response => {
      if (response.statusCode < 400) {
        console.info('Message posted successfully');
        callback(null);
      } else if (response.statusCode < 500) {
        console.error(
          `Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`,
        );
        callback(null); // Don't retry because the error is due to a problem with the request
      } else {
        // Let Lambda retry
        callback(
          `Server error when processing message: ${response.statusCode} - ${
            response.statusMessage
          }`,
        );
      }
    })
    .catch(err => {
      console.error(err);
      callback(null);
    });
}

export const handler: SNSHandler = (event, _context, callback) => {
  if (hookUrl) {
    processEvent(event, callback);
  } else {
    callback('Hook URL has not been set.');
  }
};
