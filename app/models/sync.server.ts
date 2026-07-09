import { mapShopifyProduct } from "app/services/shopify/mappers";
import prisma from "../db.server"; 

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

export async function productsFromShopify(admin: any) {
  var allProducts: any[] = [];
  var hasNextPage = true;
  var cursor: string | null = null;

  while (hasNextPage) {
 
    const response = await admin.graphql(GRAPHQL_QUERY, {
      variables: {
        cursor: cursor,
      },
    });

    const responseJson: any = await response.json();
    const productsData = responseJson.data?.products;

    if (!productsData) {
      break;
    }

    const fetchedProducts = productsData.edges.map((edge: any) => edge.node);
    allProducts = [...allProducts, ...fetchedProducts];

    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;

    console.log(`Loaded products: ${fetchedProducts.length}. Total: ${allProducts.length}`);
  }

  return allProducts;
}

export async function upsertFunc(shopDomain: string, mappedProduct: any) {
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
            },
            create: {
              shopifyId: mappedProduct.shopifyId,
              title: mappedProduct.title,
              descriptionHtml: mappedProduct.descriptionHtml,
              vendor: mappedProduct.vendor,
              productType: mappedProduct.productType,
              status: mappedProduct.status,
              tags: mappedProduct.tags,
              shopId: shop.id,
            },
          });

          await pris.variant.deleteMany({ where: { productId: product.id } });
          await pris.image.deleteMany({ where: { productId: product.id } });



          if (mappedProduct.variants?.length > 0) {
              await pris.variant.createMany({
                data: mappedProduct.variants.map((variant: any) => ({
                  ...variant,
                  productId: product.id, 
                })),
              });         
          }

          if(mappedProduct.images?.length > 0){
            await pris.image.createMany({
                data: mappedProduct.images.map((image: any) => ({
                  ...image,
                  productId: product.id,
                })),
              });
          }
      })
}


export async function syncAllProducts(admin: any, shopDomain: string) {
  const products = await productsFromShopify(admin);

  var cnt = 0;
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