const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);
const dbName = 'yellowtail';

function createTimestamp() {
  let currDateTime = new Date();
  return {
    year: currDateTime.getFullYear(),
    month: currDateTime.getMonth() + 1,
    day: currDateTime.getDate(),
    hours: currDateTime.getHours(),
    minutes: currDateTime.getMinutes()
  };
}

async function main() {
  await client.connect();
  console.log('Connected successfully to server');
  const db = client.db(dbName);
  const collection = db.collection('analytics');

  setInterval(() => {
    fetch('http://localhost:3000/rooms/data')
      .then(response => response.json())
      .then(data => {
        let timestamp = createTimestamp();
        console.log(timestamp);
        console.log(data);
        console.log(collection);
        collection.insertOne({
          'timestamp': timestamp,
          'data': data,
          'status': 'Server Up'
        }, (err, r) => {
          if (err) {
            console.log('Trouble inserting data, server up');
            console.log(err);
          }
        });
      })
      .catch(err => {
        console.log('Server is down');
        console.log(err);
        collection.insertOne({
          'timestamp': timestamp,
          'data': null,
          'status': 'Server Down'
        }, (err, r) => {
          if (err) {
            console.log('Trouble inserting data, server down');
            console.log(err);
          }
        });
      });
  }, 300000);

  return 'done.'
}

main()
  .then(console.log('Main function finished'))
  .catch(err => console.log(err));
