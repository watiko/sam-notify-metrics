```bash
$ SLACK_HOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
$ SLACK_CHANNEL="any_channel"
$ SAM_BUCKET_NAME="YOUR_BUCKET"
$ CFN_STACK_NAME="YOUR_CFN_STACK_NAME"
$ SNS_CO2_ALARM_TOPIC="arn:aws:sns:ap-northeast-1:300000000000:your-sns-topic-name"
```

```bash
$ yarn build
$ yarn package
$ yarn deploy
```
