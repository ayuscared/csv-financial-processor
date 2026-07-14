const BATCH_LIMIT = 500;
const WRITE_CONCURRENCY = 8;

/**
 * Transaction document data access.
 */
export function createTransactionRepository(db) {
  return {
    async insertMany(docs) {
      const slices = [];
      for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        slices.push(docs.slice(i, i + BATCH_LIMIT));
      }

      for (let i = 0; i < slices.length; i += WRITE_CONCURRENCY) {
        const wave = slices.slice(i, i + WRITE_CONCURRENCY);
        await Promise.all(
          wave.map(async (slice) => {
            const batch = db.batch();
            for (const data of slice) {
              batch.set(db.collection("transactions").doc(), data);
            }
            await batch.commit();
          })
        );
      }
    },
  };
}
