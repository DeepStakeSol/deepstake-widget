export interface Options {
  vote_account: string;
}

let options: Options | null = null;

export function setOptions(value: Options) {
  options = value;
}

export function getOptions(): Options | null {
  return options;
}