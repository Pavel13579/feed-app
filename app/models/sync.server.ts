import { mapShopifyProduct } from "app/services/shopify/mappers";
import prisma from "../db.server"; 
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { IGraphQlResponseType, IMappedProduct } from "app/types/types";

const SHOP_QUERY = `#graphql
  query FetchShopCurrency {
    shop {
      currencyCode
    }
  }
`;

const GRAPHQL_QUERY = `#graphql
  query FetchProductsPagination($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          status
          tags
          onlineStoreUrl
          variants(first: 100) {
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
            pageInfo {
              hasNextPage
            }
          }
          images(first: 50) {
            edges {
              node {
                id
                url
                altText
              }
            }
            pageInfo {
              hasNextPage
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

export async function currencyFromShopify(admin: AdminApiContext): Promise<string | null> {
  const response = await admin.graphql(SHOP_QUERY);
 
  const responseJson = (await response.json()) as {
    data?: { shop?: { currencyCode?: string | null } };
    errors?: Array<{ message: string }>;
  };
 
  if (responseJson.errors && responseJson.errors.length > 0) {
    const errorMessage = responseJson.errors.map((e) => e.message).join(", ");
    throw new Error(`Shopify GraphQL Error: ${errorMessage}`);
  }
 
  return responseJson.data?.shop?.currencyCode ?? null;
}
 
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

export async function upsertFunc(shopId: string, mappedProduct: IMappedProduct) {
      return prisma.$transaction(async (pris) => {
    const product = await pris.product.upsert({
      where: {
        shopId_shopifyId: {
          shopId,
          shopifyId: mappedProduct.shopifyId, 
        },
      },
      update: {
        title: mappedProduct.title,
        handle: mappedProduct.handle,
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
        handle: mappedProduct.handle,
        descriptionHtml: mappedProduct.descriptionHtml,
        vendor: mappedProduct.vendor,
        productType: mappedProduct.productType,
        status: mappedProduct.status,
        tags: mappedProduct.tags,
        onlineStoreUrl: mappedProduct.onlineStoreUrl,
        shopId,
      },
    });

          await pris.variant.deleteMany({ where: { productId: product.id } });

          if (mappedProduct.variants?.length > 0) {
              await pris.variant.createMany({
                data: mappedProduct.variants.map((variant) => ({
                  ...variant,
                  productId: product.id, 
                })),
              });         
          }

          if (mappedProduct.images?.length > 0) {
            const incomingImageIds = mappedProduct.images.map((i) => i.shopifyId);

            await pris.image.deleteMany({
              where: {
                productId: product.id,
                shopifyId: { notIn: incomingImageIds },
              },
            });

            for (const image of mappedProduct.images) {
              await pris.image.upsert({
                where: {
                  productId_shopifyId: {
                    productId: product.id,
                    shopifyId: image.shopifyId,
                  },
                },
                update: {
                  url: image.url,
                  altText: image.altText,
                  position: image.position,
                },
                create: {
                  ...image,
                  productId: product.id,
                },
              });
            }
          }
      })
}


export async function syncAllProducts(admin: AdminApiContext, shopDomain: string) {
  const products = await productsFromShopify(admin);

  let currencyCode: string | null = null;
  try {
    currencyCode = await currencyFromShopify(admin);
  } catch (error) {
    console.error(`Failed to fetch shop currency for ${shopDomain}:`, error);
  }

  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: { ...(currencyCode ? { currencyCode } : {}) },
    create: { shopDomain, currencyCode },
  });

  const syncedShopifyIds: string[] = [];
  let synced = 0;
  let failed = 0;
  for(const prod of products){
    const tempObject = mapShopifyProduct(prod);
    try{
      await upsertFunc(shop.id, tempObject);
      syncedShopifyIds.push(tempObject.shopifyId);
      synced = synced + 1;
    }catch(error){
      failed += 1;
      console.error(`Failed to sync product [ID: ${tempObject.shopifyId}] "${tempObject.title}":`, error);
    }
  }

  const deleteResult = await prisma.product.deleteMany({
    where: {
      shopId: shop.id,
      shopifyId: {
        notIn: syncedShopifyIds, 
      },
    },
  });

  const isSuccessfulSync = synced > 0 || products.length === 0;


  if (isSuccessfulSync) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  console.log(`Synced: ${synced}, Deleted stale products: ${deleteResult.count}`);

  return {
    synced,
    failed,
    deleted: deleteResult.count,
    total: products.length,
  };
}