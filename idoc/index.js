const fs = require('fs');
const path = require('path');
const pageJson = require('./demo.json');
const { iDocJson2Html, debug, BuildStage } = require('../dist/index');

debug.showId = true;
debug.showDirection = true;
debug.showSizeSpec = true;
debug.buildToStage = BuildStage.Measure;
// debug.buildAllNodes = true;
// debug.keepOriginalTree = true;
const page = iDocJson2Html(pageJson, {
    codeGenOptions: {
        experimentalZIndex: true,
        overflowMargin: true,
        textClamp: true,
        listOverflowAuto: true
    },
    treeOptions: {
        blackListNodes: [
            '660D5FA1-8794-4F6F-9FA9-ED3EA8C44D87',
            '811E4B62-6999-4F4E-8C83-0C23A656C7C7',
            '3C12BE4C-A83A-454F-9ED5-0B39E8D7AA92',
            '40E2F770-5D04-4F44-84BA-EE57B6ADE835',
            '14DC388F-6AD4-461B-9E98-A2E73C04ADD0',
            'FB0EFA2B-D90F-40C1-A502-35B262B8CCEC'
        ],
        removeGhostNodes: true
    }
});
fs.writeFileSync(path.join(__filename, '../../dist/demo.html'), page);
