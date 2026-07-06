export async function productsFromShopify(admin: any) {
  const response = await admin.graphql(`#graphql
  query syncProducts($first: Int!) {
    products(first: $first) {
      edges {
        cursor
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          status
          tags
          variants(first: 5) {
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
`, {
    variables: {
      first: 5,
    },
  });

  const responseJson = await response.json();
  
  return responseJson.data;
}