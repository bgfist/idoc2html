const fs = require('fs');
const path = require('path');
const pageJson = require('./demo.json');
const { transform } = require('../dist/index.js');

const page = transform(pageJson);
fs.writeFileSync(path.join(__filename, '../../dist/demo.html'), page);