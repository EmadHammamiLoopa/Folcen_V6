const { MongoClient } = require('mongodb');

async function listAllDocumentsInCluster() {
  const uri = "mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/?retryWrites=true&w=majority";
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
