export interface PostResponse {
  body: any;
  statusCode: number;
  statusMessage?: string;
}

export interface SlackMessageAttachment {
  text?: string;
  color?: string;
  image_url?: string;
}

export interface SlackMessageRequest {
  attachments: SlackMessageAttachment[];
  channel: string;
  icon_emoji?: string;
  link_names?: boolean;
  text?: string;
  username?: string;
}

export interface SNSMessage {
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
