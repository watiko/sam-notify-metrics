import { format, parse } from 'date-fns';
import * as jaLocale from 'date-fns/locale/ja';

export function formattedDateStringForKey(dateStr: string): string {
  const date = parse(dateStr);
  return format(date, 'YYYY/MM/DD/HH-mm-ss', { locale: jaLocale });
}

export function defer<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: any) => void;
} {
  let resolve: any;
  let reject: any;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}
