'use strict';

// import * as AWS from 'aws-sdk';
import { Callback, SNSEvent, SNSHandler } from 'aws-lambda';
import * as https from 'https';
import * as url from 'url';

const slackChannel = process.env.SLACK_CHANNEL!;
const hookUrl = process.env.SLACK_HOOK_URL!;

interface SlackMessageAttachment {
  text?: string;
  color?: string;
}

interface SlackMessageRequest {
  attachments: SlackMessageAttachment[];
}

function postMessage(
  message: SlackMessageRequest,
  callback: (res: { body: any; statusCode: number; statusMessage?: string }) => void,
) {
  const body = JSON.stringify(message);
  const options: https.RequestOptions = url.parse(hookUrl);
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
      if (callback) {
        callback({
          body: chunks.join(''),
          statusCode: res.statusCode!,
          statusMessage: res.statusMessage,
        });
      }
    });
    return res;
  });

  postReq.write(body);
  postReq.end();
}

interface SNSMessage {
  AlarmName: string;
  AlarmDescription: string;
  AWSAccountId: string;
  NewStateValue: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  StateChangeTime: string; // '2017-11-29T01:10:32.907+0000'
  Region: string;
  OldStateValue: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  Trigger: {
    MetricName: string;
    Namespace: string;
    StatisticType: string;
    Statistic: string;
    Unit: null | string;
    Dimensions: any[];
    Period: number;
    EvaluationPeriods: number;
    ComparisonOperator: string;
    Threshold: number;
    TreatMissingData: string;
    EvaluateLowSampleCountPercentile: string;
  };
}

function processEvent(event: SNSEvent, callback: Callback) {
  const message: SNSMessage = JSON.parse(event.Records[0].Sns.Message);

  const alarmName = message.AlarmName;
  const newState = message.NewStateValue;
  const reason = message.NewStateReason;

  let text;
  const iconEmoji = ':thinking_face:';
  const attachment: SlackMessageAttachment = {};

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

  const slackMessage = {
    attachments: [attachment],
    channel: slackChannel,
    icon_emoji: iconEmoji,
    link_names: true,
    text,
    username: 'CO2 Monitor',
  };

  postMessage(slackMessage, response => {
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
        `Server error when processing message: ${response.statusCode} - ${response.statusMessage}`,
      );
    }
  });
}

export const handler: SNSHandler = (event, _context, callback) => {
  if (hookUrl) {
    processEvent(event, callback);
  } else {
    callback('Hook URL has not been set.');
  }
};
