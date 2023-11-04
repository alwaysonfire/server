const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const moment = require('moment');
const crypto = require('crypto');
const app = express();
const port = 3001;

// Increase the JSON request size limit to 10MB
app.use(express.json({ limit: '10mb' }));

// Increase the URL-encoded request size limit to 10MB
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cors());

const membersFilePath = path.join(__dirname, 'data', 'members.json');

function getCurrentDate() {
  const currentDate = moment();
  return currentDate.format('MM-DD-YYYY');
}

function getWeek() {
  const startOfWeek = moment().startOf('week');
  const endOfWeek = moment().endOf('week');
  return `${startOfWeek.format('MMMM D')} - ${endOfWeek.format('MMMM D')}.json`;
}

function generateRandomId(length) {
  return crypto.randomBytes(length).toString('hex');
}

const users = JSON.parse(fs.readFileSync('./data/admin.json', 'utf8'));

const attendanceFileName = getWeek();
const attendanceFilePath = path.join(__dirname, 'data', attendanceFileName);

const thisWeekFilePath = path.join(__dirname, 'data', 'thisweek.json');
function generateAttendance() {
  const membersContent = fs.readFileSync(membersFilePath, 'utf-8');
  const membersData = JSON.parse(membersContent);
  const arrayOfObjects = membersData.map(name => ({
    Name: name,
    GB: { count: 0, lastUpdated: '' },
    GPC: { count: 0, lastUpdated: '' },
    GE: { count: 0, lastUpdated: '' },
  }));
  fs.writeFileSync(attendanceFilePath, JSON.stringify(arrayOfObjects, null, 2));
}
let existingData = [];
if (fs.existsSync(attendanceFilePath)) {
  console.log('exists');
} else {
  // If the file doesn't exist, create it with the initial data
  generateAttendance();
}

// Endpoint to get the contents of the JSON file
app.get('/data', (req, res) => {
  // Read the data from the JSON file
  const fileContent = fs.readFileSync(attendanceFilePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  res.json(jsonData);
});

app.get('/pending', (req, res) => {
  // Read the data from the JSON file
  const fileContent = fs.readFileSync(thisWeekFilePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  res.json(jsonData);
});

app.post('/submit', (req, res) => {
  const { selectedNames, imageBase64, type } = req.body;

  // Create the data object to be appended
  const newData = {
    date: getCurrentDate(),
    selectedNames,
    imageBase64,
    type,
    id: generateRandomId(4),
  };

  // Define the path to the JSON file
  const filePath = path.join(__dirname, 'data', 'thisweek.json');

  // Read the existing data from the JSON file (if it exists)
  let existingData = [];
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    existingData = JSON.parse(fileContent);
  }

  // Append the new data to the existing array
  existingData.push(newData);

  // Write the updated array back to the JSON file
  fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));

  res.json({ success: true, message: 'Data saved successfully.' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  console.log('users', users);

  if (users.username == username && users.password === password) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/approve/:id', (req, res) => {
  const { id } = req.params;
  const fileContent = fs.readFileSync(thisWeekFilePath, 'utf-8');
  const attendanceContent = fs.readFileSync(attendanceFilePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);
  const attendanceData = JSON.parse(attendanceContent);

  const { selectedNames, type } = jsonData.find(item => item.id == id);

  selectedNames.forEach(name => {
    const memberData = attendanceData.find(item => item.Name === name);

    if (memberData) {
      console.log('type', type);
      if (memberData[type].lastUpdated == getCurrentDate()) {
        console.log('cant have multiple updates');
      } else {
        memberData[type].count = memberData[type].count + 1;
        memberData[type].lastUpdated = getCurrentDate();
      }
    }
  });
  const updatedData = jsonData.filter(item => item.id !== id);
  fs.writeFileSync(attendanceFilePath, JSON.stringify(attendanceData, null, 2));
  fs.writeFileSync(thisWeekFilePath, JSON.stringify(updatedData, null, 2));
  res.json({ message: 'Attendance record approved.' });
});

// API route to decline an attendance record
app.post('/decline/:id', (req, res) => {
  const { id } = req.params;
  const fileContent = fs.readFileSync(thisWeekFilePath, 'utf-8');
  const jsonData = JSON.parse(fileContent);

  // Filter out the object with the same id
  const updatedData = jsonData.filter(item => item.id !== id);

  // Save the updated data back to the file
  fs.writeFileSync(thisWeekFilePath, JSON.stringify(updatedData, null, 2));

  res.json({ message: 'Attendance record declined.' });
});

app.get('/export', (req, res) => {
  const fileContent = fs.readFileSync(attendanceFilePath, 'utf-8');
  const dataToExport = JSON.parse(fileContent);

  if (dataToExport) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=exported-data.json'
    );

    res.json(dataToExport);
  } else {
    res.status(500).json({ error: 'Data not found' });
  }
});

app.post('/clear', (req, res) => {
  // Check if the files exist and delete them
  try {
    if (fs.existsSync(attendanceFilePath)) {
      fs.unlinkSync(attendanceFilePath); // Delete the attendance file
    }

    if (fs.existsSync(thisWeekFilePath)) {
      fs.unlinkSync(thisWeekFilePath); // Delete the this week file
    }
    //write a new one after clearing
    generateAttendance();

    res.json({ message: 'Data cleared successfully' });
  } catch (error) {
    // Handle errors, e.g., if the files don't exist
    console.error('Error clearing data:', error);
    res.status(500).json({ error: 'Error clearing data' });
  }
});

app.post('/addMember/:memberName', (req, res) => {
  try {
    const { memberName } = req.params;
    const attendanceContent = fs.readFileSync(attendanceFilePath, 'utf-8');
    const membersContent = fs.readFileSync(membersFilePath, 'utf-8');
    const membersData = JSON.parse(membersContent);
    const attendanceData = JSON.parse(attendanceContent);

    const newMemberObj = {
      Name: memberName,
      GB: {
        count: 0,
        lastUpdated: '',
      },
      GPC: {
        count: 0,
        lastUpdated: '',
      },
      GE: {
        count: 0,
        lastUpdated: '',
      },
    };

    attendanceData.push(newMemberObj);
    membersData.push(memberName);
    fs.writeFileSync(membersFilePath, JSON.stringify(membersData, null, 2));
    fs.writeFileSync(
      attendanceFilePath,
      JSON.stringify(attendanceData, null, 2)
    );

    // console.log("jsonData", memberName);
    res.json({ message: 'Member Added Successfully!' });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err, message: 'Member Not Added' });
  }
});

app.post('/delete', (req, res) => {
  const selectedNames = req.body;
  console.log('selectedNames', selectedNames);

  const attendanceContent = fs.readFileSync(attendanceFilePath, 'utf-8');
  const membersContent = fs.readFileSync(membersFilePath, 'utf-8');
  let membersData = JSON.parse(membersContent);
  let attendanceData = JSON.parse(attendanceContent);

  // Use filter with a condition to remove selected members
  membersData = membersData.filter(item => !selectedNames.includes(item));
  attendanceData = attendanceData.filter(
    item => !selectedNames.includes(item.Name)
  );

  // Update the JSON data files with the filtered data
  fs.writeFileSync(membersFilePath, JSON.stringify(membersData, null, 2));
  fs.writeFileSync(attendanceFilePath, JSON.stringify(attendanceData, null, 2));

  res.json({ success: true, message: 'Members deleted successfully.' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
