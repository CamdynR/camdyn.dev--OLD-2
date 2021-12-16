// script.js

let key, value;

function populateChart(data) {
  if (data) {
    let ts = data[0].timestamp;
    let dateStr = `${ts.month}/${ts.day}/${ts.year} ${ts.hours}:${ts.minutes}`;
    console.log(dateStr);
    let startTime = new Date(dateStr).getTime();
    let peopleArr = [];
    let roomArr = [];
    data.forEach(entry => {
      if (entry.status == 'Server Up') {
        peopleArr.push(entry.data.currNumUsers);
        roomArr.push(entry.data.currNumRooms);
      }
    });

    ZC.LICENSE = ["569d52cefae586f634c54f86dc99e6a9", "b55b025e438fa8a98e32482b5f768ff5"];
    let myConfig = {
      "type": "line",
      "legend": {

      },
      "scale-x": {
        "min-value": startTime,
        "step": "5minute",
        "transform": {
          "type": "date",
          "all": "%m/%d/%Y<br>%h:%i %A"
        },
        "item": {
          "font-size": 9
        }
      },
      "utc": true,
      "timezone": 0,
      "series": [{
          "values": peopleArr,
          "text": "Num People Online"
        },
        {
          "values": roomArr,
          "text": "Num Rooms"
        },
      ]
    };
 
    zingchart.render({
      id: 'myChart',
      data: myConfig,
      height: 400,
      width: "100%"
    });
  }
}

function attemptFetch() {
  if (key && value) {
    let options = {
      method: 'GET',
      cache: 'no-cache',
      headers: {}
    }
    options.headers[key] = value;
    fetch('https://analytics.yellowtail.app/api', options)
     .then(response => response.json())
     .then(data => {
       document.querySelector('body').classList.remove('modal');
       console.log(data);
       populateChart(data);
     })
     .catch(err => {
       document.querySelector('#key').classList.add('incorrect');
       document.querySelector('#value').classList.add('incorrect');
       console.log(err);
     });
  }
}

function bindEvents() {
  let keyInput, valueInput, modalForm;
  keyInput = document.querySelector('#key');
  valueInput = document.querySelector('#value');
  modalForm = document.querySelector('#tokenModal form');

  modalForm.addEventListener('submit', e => {
    e.preventDefault();
    key = keyInput.value;
    value = valueInput.value;
    keyInput.value = '';
    valueInput.value = '';
    attemptFetch();
  });
}

function init() {
  bindEvents();
}

window.addEventListener('DOMContentLoaded', init);