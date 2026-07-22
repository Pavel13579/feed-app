import { mapShopifyProduct } from "app/services/shopify/mappers";
import prisma from "../db.server"; 
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { IGraphQlResponseType, IMappedProduct } from "app/types/types";

const GRAPHQL_QUERY = `#graphql
  query FetchProductsPagination($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          status
          tags
          onlineStoreUrl
          variants(first: 10) {
            edges {
              node {
                id
                sku
                barcode
                price
                compareAtPrice
                inventoryQuantity
              }
            }
          }
          images(first: 5) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export async function productsFromShopify(admin: AdminApiContext) : Promise<IGraphQlResponseType[]> {
  let allProducts: IGraphQlResponseType[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
 
    const response = await admin.graphql(GRAPHQL_QUERY, {
      variables: {
        cursor: cursor,
      },
    });

    const responseJson = (await response.json()) as {
      data?: {
        products?: {
          edges: Array<{ node: IGraphQlResponseType }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (responseJson.errors && responseJson.errors.length > 0) {
      const errorMessage = responseJson.errors.map((e) => e.message).join(", ");
      throw new Error(`Shopify GraphQL Error: ${errorMessage}`);
    }


    const productsData = responseJson.data?.products;

    if (!productsData) {
      throw new Error("Failed to fetch products from Shopify: invalid response structure");
    }

    const fetchedProducts = productsData.edges.map((edge) => edge.node);
    allProducts = [...allProducts, ...fetchedProducts];

    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;

    console.log(`Loaded products: ${fetchedProducts.length}. Total: ${allProducts.length}`);
  }

  return allProducts;
}

export async function upsertFunc(shopDomain: string, mappedProduct: IMappedProduct) {
      return prisma.$transaction(async (pris) => {
          const shop = await pris.shop.upsert({
            where: { shopDomain },
            update: { shopDomain },
            create: { shopDomain },
          });

          const product = await pris.product.upsert({
            where: {
              shopId_shopifyId: {
              shopId: shop.id,            
              shopifyId: mappedProduct.shopifyId, 
            },
            },
            update: {
              title: mappedProduct.title,
              descriptionHtml: mappedProduct.descriptionHtml,
              vendor: mappedProduct.vendor,
              productType: mappedProduct.productType,
              status: mappedProduct.status,
              tags: mappedProduct.tags,
              onlineStoreUrl: mappedProduct.onlineStoreUrl,
            },
            create: {
              shopifyId: mappedProduct.shopifyId,
              title: mappedProduct.title,
              descriptionHtml: mappedProduct.descriptionHtml,
              vendor: mappedProduct.vendor,
              productType: mappedProduct.productType,
              status: mappedProduct.status,
              tags: mappedProduct.tags,
              onlineStoreUrl: mappedProduct.onlineStoreUrl,
              shopId: shop.id,
            },
          });

          await pris.variant.deleteMany({ where: { productId: product.id } });
          await pris.image.deleteMany({ where: { productId: product.id } });



          if (mappedProduct.variants?.length > 0) {
              await pris.variant.createMany({
                data: mappedProduct.variants.map((variant) => ({
                  ...variant,
                  productId: product.id, 
                })),
              });         
          }

          if(mappedProduct.images?.length > 0){
            await pris.image.createMany({
                data: mappedProduct.images.map((image) => ({
                  ...image,
                  productId: product.id,
                })),
              });
          }
      })
}


export async function syncAllProducts(admin: AdminApiContext, shopDomain: string) {
  const products = await productsFromShopify(admin);

  let cnt = 0;
  for(const prod of products){
    const tempObject = mapShopifyProduct(prod);
    try{
      await upsertFunc(shopDomain, tempObject);
      cnt = cnt + 1;
    }catch(error){
      console.log("Failed to sync product");
    }
  }

  return cnt;
}