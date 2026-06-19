import { PaginationParams } from '../decorators/pagination.decorator';

export function paginate<T>(data: T[], total: number, params: PaginationParams) {
  return {
    data,
    total,
    page: params.page,
    pageSize: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}
