// Express Server Constants
const express = require('express');
const cors = require('cors');
const validator = require('validator');
const app = express();
const port = 3000;

// Send / Receive as JSON with Express
app.use(express.json());

// Socket.io Constants
const httpServer = require('http').createServer(app);
const io = require("socket.io")(httpServer, {
  serveClient: false,
  cors: {
    origin: "https://static.crunchyroll.com",
    methods: ["GET", "POST"]
  }
});

// Rooms Array where we'll store all of our rooms
let rooms = {};
let socketIDrooms = {}; // quick lookup of room number for each socketID

/***********************************/
/***     Express App Routing     ***/
/***********************************/

// Hello, world!
app.get('/', cors(), (req, res) => {
  res.send('Hello, world!');
});

// Send back the room URL for a given room code
app.get('/url/:roomCode', cors(), (req, res) => {
  // Capitalize the given room code
  let roomCode = req.params.roomCode.toUpperCase();
  // Sanitize User Input
  roomCode = validator.whitelist(roomCode, 'BCDFGHJKLMNPQRSTVWXYZ');

  /**
   * Determine whether or not the given input is valid
   * @return {Boolean} Whether the keycode is a valid format
   */
   function _parseRoomCode(roomCode) {
    const letterSet = 'BCDFGHJKLMNPQRSTVWXYZ';
    if (roomCode.length == 5) {
      for (let i = 0; i < 5; i++) {
        if (!letterSet.includes(roomCode.charAt(i))) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  if (!_parseRoomCode(roomCode)) {
    res.status(400).send('Invalid room code');
    return;
  }

  if (!rooms[roomCode]) {
    res.status(400).send('Room does not exist');
    return;
  }

  res.send(rooms[roomCode].url);
});

/**
 * Get data about current rooms / connected people
 */
app.get('/rooms/data', cors(), (req, res) => {
  res.send({
    currNumRooms: Object.keys(rooms).length,
    currNumUsers: Object.keys(socketIDrooms).length
  });
});

// // For options request, send 204 ok no data
app.options('/', cors(), (req, res) => {
  res.status(204).end();
});

// // For everything else, send 405 method not allowed
app.all('/', cors(), (req, res) => {
  res.status(405).end();
});

/***********************************/
/***     Socket.io Messaging     ***/
/***********************************/

io.on('connection', socket => {
  
  socket.emit('socketID', { socketID: socket.id });

  socket.on('disconnect', () => {
    // If there's a room associated with this person
    if (socketIDrooms[socket.id]) {
      // If that room still exists
      if (rooms[socketIDrooms[socket.id]]) {

        let roomLeftDetails = leaveRoom(socket.id, socketIDrooms[socket.id]);

        // If that room has a url transfer queue and that person's in the queue
        let queue = rooms[socketIDrooms[socket.id]]?.urlTransferQueue;
        if (queue && queue.indexOf(socket.id) > -1) {
          rooms[socketIDrooms[socket.id]].urlTransferQueue.splice(queue.indexOf(socket.id), 1);
          // Message the room that a user is transferring
          console.log('Loading new video');
          socket.to(socketIDrooms[socket.id]).emit('notification', {
            status: 'loading new video',
            participant: socket.id
          });

        // Otherwise they're not in the queue
        } else {
          // Message the room that a user has disconnected
          socket.to(socketIDrooms[socket.id]).emit('notification', {
            status: 'guest left',
            participant: roomLeftDetails.participant,
            host: roomLeftDetails.host
          });
        }

      }
      delete socketIDrooms[socket.id];
    }
  });

  socket.on('create room', content => {
    // Create the room
    let roomCode = createRoom(socket.id, content.participant, content.url);
    console.log(`Room Created - ${roomCode}`);

    // Add to the socketIDroom reference
    socketIDrooms[socket.id] = roomCode;

    // Subscribe the user to the current room
    socket.join(roomCode);

    // Message back that room was created
    socket.emit('notification', { 
      status: 'room created',
      roomCode: roomCode
    });
  });

  // Add user to room
  socket.on('join room', content => {
    // Check if the room exists
    if (!Object.keys(rooms).includes(content.code)) {
      socket.emit('error', { message: 'Room doesn\'t exist' });
      return;
    }
    // Check if the room is full (max of 4)
    if (rooms[content.code].guests.length >= 3) {
      socket.emit('error', { message: 'Room full' });
      return;
    }

    // Join the room
    let roomInfo = joinRoom(socket.id, content.participant, content.code);
    roomInfo['code'] = content.code;

    // Add to the socketIDroom reference
    socketIDrooms[socket.id] = content.code;

    // Subscribe the user to the current room
    socket.join(content.code);

    // Message back that room was joined
    socket.emit('notification', { 
      status: 'room joined',
      roomInfo: roomInfo
    });

    // Message the rest of the room that someone joined
    content.participant.socketID = socket.id;
    socket.to(content.code).emit('notification', {
      status: 'guest joined',
      participant: content.participant
    });
  });

  // Pass messages between users in rooms
  socket.on('message', content => {
    socket.to(content.room).emit('message', {
      message: content.message,
      socketID: socket.id
    });
  });

  // Handler for any video player interactions (pause, play, etc)
  socket.on('video', content => {
    socket.to(content.roomCode).emit('video', {
      state: content.state,
      time: content.time,
      socketID: socket.id
    });
  });

  // Update user object, send update back to other guests
  socket.on('update', content => {
    updateParticipant(socket.id, content.participant, content.roomCode);
    socket.to(content.roomCode).emit('update', {
      participant: content.participant,
      socketID: socket.id
    });
  });

  // When someone changes episodes this updates it for the whole room
  socket.on('new URL', content => {
    console.log(`New URL for Room ${content.roomCode}: ${content.url}`);
    rooms[content.roomCode].url = content.url;
    
    // Create a transfer queue and add all the people who didn't initiate the new video
    rooms[content.roomCode].urlTransferQueue = [];
    // First check the host
    if (rooms[content.roomCode]['host'].socketID != socket.id) {
      rooms[content.roomCode].urlTransferQueue.push(rooms[content.roomCode]['host'].socketID);
    }
    // Then all the guests
    for (let i = 0; i < rooms[content.roomCode]['guests'].length; i++) {
      let currGuest = rooms[content.roomCode]['guests'][i].socketID;
      if (currGuest != socket.id) {
        rooms[content.roomCode].urlTransferQueue.push(currGuest);
      }
    }

    socket.to(content.roomCode).emit('new URL', {
      url: content.url
    });
  });

  socket.on('kick participant', content => {
    console.log(`kick participant -> ${content.socketID}`);
    socket.to(content.roomCode).emit('kick me', {
      socketID: content.socketID
    });
  });

  socket.on('kick me', () => {
    let roomLeftDetails = leaveRoom(socket.id, socketIDrooms[socket.id]);
    if (rooms[socketIDrooms[socket.id]]) {
      // Message the room that a user has disconnected
      socket.to(socketIDrooms[socket.id]).emit('notification', {
        status: 'guest was kicked',
        participant: roomLeftDetails.participant,
        host: roomLeftDetails.host
      });
    }
    delete socketIDrooms[socket.id];
    console.log('User was kicked');
    socket.disconnect();
  });
});

/**
 * Escape some characters that could be hazardous
 * @param {String} input String to sanitize
 * @returns 
 */
function _sanitizeInput(input) {
  input = input.replace(/</g, '&lt;');
  input = input.replace(/>/g, '&gt;');
  input = input.replace(/\//g, '&#47;');
  input = input.replace(/`/g, '&#96;');
  input = input.replace(/'/g, '&#39;');
  input = input.replace(/"/g, '&#34;');
  return input;
}

/**
 * Generates a unique room code based on current room codes to avoid clashing
 * @return {String} The newly generated 5 digit room code
 */
function generateRoomCode() {
  const letterSet = 'BCDFGHJKLMNPQRSTVWXYZ';

  /**
   * Generates a new 5 character room code
   * @returns {String} A 5 character room code
   */
  function _makeRoomCode() {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += letterSet.charAt(Math.floor(Math.random() * letterSet.length));
    }
    return code;
  }

  // Generate new room code, make sure it's not in the array already
  let newRoomCode = _makeRoomCode();
  while (Object.keys(rooms).includes(newRoomCode)) {
    newRoomCode = _makeRoomCode();
  }

  return newRoomCode;
}

/**
 * Creates a new room, adds it to the rooms variable
 * @param {String} socketID Unique socket ID for creator of the room
 * @param {Object} participant The nickname & avatar of the new participant
 * @param {String} URL The URL of the video that the room was created for
 * @return {String} The room code of the newly created room
 */
function createRoom(socketID, participant, URL) {
  // Grab a new room code
  let roomCode = generateRoomCode();
  // Add the socketID to the given participant (which has nickname and avatar only)
  participant['socketID'] = socketID;
  participant['type'] = 'Host';
  // Add the new room to the rooms object
  rooms[roomCode] = {
    host: participant,
    guests: [],
    url: URL
  }
  // Return the new room code
  return roomCode;
}

/**
 * Adds a user to a room that currently exists
 * @param {String} socketID Unique socket ID for the room joiner
 * @param {Object} participant The nickname & avatar of the new participant
 * @param {String} roomCode The room code of the room to join
 * @return {Object} The room information object
 */
function joinRoom(socketID, participant, roomCode) {
  // Add the socketID to the given participant (which has nickname and avatar only)
  participant['socketID'] = socketID;
  participant['type'] = 'Guest';
  // Grab the current room info (The JSON.parse() thing is the easiest way to deep copy)
  let roomInfo = JSON.parse(JSON.stringify(rooms[roomCode]));
  // Add the new participant to the array now that the arrays been copied
  rooms[roomCode]['guests'].push(participant);
  // Return the room object (which has participants and url)
  return roomInfo;
}

/**
 * Removes a user from a room. If the room is empty, it is destroyed
 * @param {String} socketID Unique socket ID for the room leaver
 * @param {String} roomCode The room code of the room to leave
 * @return {Object} The participant object containing, socketID, nickname, 
 *                  and avatar of person who left as well as socketID of new host
 */
function leaveRoom(socketID, roomCode) {
  // Create participant with info to return
  let participant = {};
  participant[socketID] = {};
  let host = rooms[roomCode].host.socketID;
  // Check if participant was the room host
  if (socketID == rooms[roomCode].host.socketID) {
    // Grab the host information before overwriting it
    participant[socketID].nickname = rooms[roomCode].host.nickname;
    participant[socketID].avatar = rooms[roomCode].host.avatar;
    // If there are guests left, promote one of them to host
    if (rooms[roomCode].guests.length > 0) {
      rooms[roomCode].host = rooms[roomCode].guests.shift()
      host = rooms[roomCode].host.socketID;
    // Otherwise, delete the room since no ones left
    } else {
      delete rooms[roomCode];
      console.log(`Room Destroyed - ${roomCode}`);
    }
  } else {
    for (let i = 0; i < rooms[roomCode].guests.length; i++) {
      if (socketID == rooms[roomCode].guests[i].socketID) {
        // Grab the guest information before deleting it
        participant[socketID].nickname = rooms[roomCode].guests[i].nickname;
        participant[socketID].avatar = rooms[roomCode].guests[i].avatar;
        // Delete the guest
        rooms[roomCode].guests.splice(i,1);
      }
    }
  }
  return { host: host, participant: participant };
}

/**
 * When a user updates their icon or nickname, this saves it to the rooms object
 * @param {String} socketID Unique socket ID for the room joiner
 * @param {Object} participant The new nickname & avatar of the participant
 * @param {String} roomCode The room code of the room of the participant
 */
function updateParticipant(socketID, participant, roomCode) {
  participant.nickname = _sanitizeInput(participant.nickname);
  participant.avatar = _sanitizeInput(participant.avatar);

  participant['socketID'] = socketID;
  // Check if the participant is the host
  if (socketID == rooms[roomCode].host.socketID) {
    participant['type'] = 'Host';
    rooms[roomCode].host = participant;
  // If not, look for them in guests
  } else {
    for (let i = 0; i < rooms[roomCode].guests.length; i++) {
      if (socketID == rooms[roomCode].guests[i].socketID) {
        participant['type'] = 'Guest';
        rooms[roomCode].guests[i] = participant;
      }
    }
  }
}

httpServer.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});