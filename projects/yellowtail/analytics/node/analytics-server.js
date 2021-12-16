const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
const port = 3001;

// Send / Receive as JSON
app.use(express.json());

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);
const dbName = 'yellowtail';
let collection, db;

client.connect().then(() => {
  db = client.db(dbName);
  collection = db.collection('analytics');
});

app.get('/', (req, res) => {
  let token = req.header('x-sent-by')
  if (token == 'peacemaintainer') {
    collection.find({})
     .toArray()
     .then(results => {
       res.send(results);
    });
  } else {
    res.status(401).send();
  }
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})