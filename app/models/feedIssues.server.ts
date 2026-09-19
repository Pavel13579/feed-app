import db from "../db.server";

export const ISSUE_PAGE_SIZE = 25;

export type IssueProductRow = {
  productId: string;
  shopifyId: string;
  title: string;
  affectedVariants: number;
  message: string | null;
};

export async function getIssueProductsPage(params: {
  feedId: string;
  shopId: string;
  code: string;
  page: number;
  pageSize?: number;
}) {
  const { feedId, shopId, code, page } = params;
  const pageSize = params.pageSize ?? ISSUE_PAGE_SIZE;

  const where = {
    shopId,
    issues: { some: { feedId, code } },
  };

  const totalProducts = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(totalProducts / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const products = await db.product.findMany({
    where,
    select: {
      id: true,
      title: true,
      shopifyId: true,
      issues: {
        where: { feedId, code },
        select: { variantId: true, message: true },
      },
    },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: pageSize,
    skip: (safePage - 1) * pageSize,
  });

  const rows: IssueProductRow[] = products.map((product) => {
    const variantIds = new Set(
      product.issues.map((issue) => issue.variantId).filter(Boolean) as string[]
    );

    return {
      productId: product.id,
      shopifyId: product.shopifyId,
      title: product.title,
      affectedVariants: variantIds.size || product.issues.length,
      message: product.issues.find((issue) => issue.message)?.message ?? null,
    };
  });

  return { rows, totalProducts, page: safePage, pageCount, pageSize };
}