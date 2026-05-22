export interface IPageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
