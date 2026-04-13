type RowsLike<T> = readonly T[] | { rows: T[] };

const hasRows = <T>(result: RowsLike<T>): result is { rows: T[] } =>
  !Array.isArray(result);

export const getRows = <T>(result: RowsLike<T>): readonly T[] =>
  hasRows(result) ? result.rows : result;

export const getFirstRow = <T>(result: RowsLike<T>): T | undefined =>
  getRows(result)[0];

export const requireFirstRow = <T>(
  result: RowsLike<T>,
  message = "Expected query to return a row.",
): T => {
  const row = getFirstRow(result);
  if (!row) {
    throw new Error(message);
  }

  return row;
};
