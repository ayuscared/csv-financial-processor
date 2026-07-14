/**
 * Upload document data access — repositories own Firestore I/O.
 */
export function createUploadRepository(db) {
  return {
    docRef(uploadId) {
      return db.collection("uploads").doc(uploadId);
    },

    async getById(uploadId) {
      const snap = await this.docRef(uploadId).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() };
    },

    async listByUid(uid) {
      const snap = await db.collection("uploads").where("uid", "==", uid).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async update(uploadId, fields) {
      await this.docRef(uploadId).update(fields);
    },
  };
}
