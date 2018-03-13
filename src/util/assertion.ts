
export function error(message: string) {
  throw new Error(message);
}

export function required(value: any, variable: string) {
  if (value == null) error(`The ${variable} is required.`);
}

export function stringed(value: any, variable: string) {
  if (!value || typeof value !== 'string')
    error(`The ${variable} is required to be string.`);
}

/**
 * 必须是正整数
 * @param num
 * @param variable
 */
export function integer(num: any, variable: string) {
  if (isNaN(num = +num) || num <= 0 || num % 1 !== 0)
    error(`The ${variable} is required to be integer.`);
}
