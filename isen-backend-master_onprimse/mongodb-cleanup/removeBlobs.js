const { MongoClient } = require('mongodb');

async function listAllDocumentsInCluster() {
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

  const uri = process.env.MONGODB_URL;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();

    for (const dbInfo of databases.databases) {
      const dbName = dbInfo.name;
      const database = client.db(dbName);
      const collections = await database.listCollections().toArray();

      console.log(`Database: ${dbName}`);

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const collection = database.collection(collectionName);
        const documents = await collection.find({}).toArray();

        console.log(`  Collection: ${collectionName}`);
        console.log(`    ${documents.length} documents found:`);
        console.log(documents);
      }
    }
  } catch (err) {
    console.error('Error listing documents:', err);
  } finally {
    await client.close();
  }
}

listAllDocumentsInCluster().catch(console.error);
