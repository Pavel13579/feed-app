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