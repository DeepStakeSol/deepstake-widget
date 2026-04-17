export const removeBigint = (obj: any) => {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
};
