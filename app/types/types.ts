export interface IGraphQlResponseType {
  id: string;
  title: string;
  handle?: string | null;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status: string;
  tags: string[];
  onlineStoreUrl?: string | null;
  variants?: {
    edges: Array<{
      node: {
        id: string;
        sku?: string | null;
        barcode?: string | null;
        price: string;
        compareAtPrice?: string | null;
        inventoryQuantity: number;
      };
    }>;
    pageInfo?: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
  images?: {
    edges: Array<{
      node: {
        id: string;
        url: string;
        altText?: string | null;
      };
    }>;
    pageInfo?: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
  };
}



export interface IMappedProduct {
  shopifyId: string;
  title: string;
  handle: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status: string;
  tags: string[];
  onlineStoreUrl?: string | null;
  variants: Array<{
    shopifyId: string;
    sku?: string | null;
    barcode?: string | null;
    price: string; 
    compareAtPrice?: string | null;
    inventoryQuantity: number;
  }>;
  images: Array<{
    shopifyId: string;
    url: string;
    altText?: string | null;
    position: number;
  }>;
}