const cors = require('cors');
const express = require('express');
const multer = require('multer');

const app = express();
const path = require('path');
var throttle = require('express-throttle-bandwidth');
// var fileupload = require("express-fileupload");
// app.use(fileupload());

app.use(throttle(100000));

global.__basedir = __dirname;

var corsOptions = {
  origin: 'http://localhost:3010',
};

app.use(cors());

app.use(express.static('static'));

app.get('/', (req, res) => {
  res.sendFile(path.resolve('pages/index.html'));
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

const upload = multer({ storage: storage })

app.use(cors())


app.post('/alfresco/upload', upload.single('file'), async(req, res) => {
        var AlfrescoApi = require('alfresco-js-api-node');

        var alfrescoJsApi = new AlfrescoApi({ provider:'ECM', hostEcm: 'http://alfresco.moc.com:8080' });

        alfrescoJsApi.login("admin", "admin").then(function (data) {
          console.log('API called successfully to login into Alfresco Content Services.');
        }, function (error) {
          console.error('Trap error',error);
        });

        var fs = require('fs');
        var result = [];
        
        var fileToUpload = fs.createReadStream(req.file.path);
        await alfrescoJsApi.upload.uploadFile(fileToUpload,'ChronoscanInvoices')
        .then(function (response) {
            const nodeid = response.entry.id;
            const filename = response.entry.name;
            console.log('File Uploaded in the ChronoscanInvoices');
            //var previewUrl = alfrescoJsApi.content.getDocumentPreviewUrl(response.entry.id);
                              var contentUrl = alfrescoJsApi.content.getContentUrl(response.entry.id);
            console.log(contentUrl)
            result.push({'status': 200, 'filename': filename, 'nodeid': nodeid, 'contentUrl': contentUrl, 'message': 'File - '+filename+' uploaded successfully' });
        }, function (error) {
            console.log('errorkey', JSON.parse(error.response.text).error.errorKey)
            console.log('Error during the upload' + error);
            //result.push(error);
            result.push({'status': 409, 'message': JSON.parse(error.response.text).error.errorKey });
        });
        res.json(result);
    });

app.post('/invoice/upload', upload.array('file', 4), async(req, res) => {
    var AlfrescoApi = require('alfresco-js-api-node');
    var alfrescoJsApi = new AlfrescoApi({ provider:'ECM', hostEcm: 'http://alfresco.moc.com:8080' });

    alfrescoJsApi.login('admin', 'admin').then(function (data) {
      console.log('API called successfully to login into Alfresco Content Services.');
    }, function (error) {
      console.error(error);
    });

      var fs = require('fs');
      var result = [];
      for(var i = 0; i < req.files.length; i++){
        var fileToUpload = fs.createReadStream(req.files[i].path);
        await alfrescoJsApi.upload.uploadFile(fileToUpload,'ChronoscanInvoices')
        .then(function (response) {
            const nodeid = response.entry.id;
            const filename = response.entry.name;
            console.log('File Uploaded in the ChronoscanInvoices');
            //var previewUrl = alfrescoJsApi.content.getDocumentPreviewUrl(response.entry.id);
            var contentUrl = alfrescoJsApi.content.getContentUrl(response.entry.id);
            console.log(contentUrl)
            result.push({'status': 200, 'entryid': response.entry.id, 'filename': filename, 'nodeid': nodeid, 'contentUrl': contentUrl, 'message': 'File - '+filename+' uploaded successfully' });
        }, function (error) {
            console.log('errorkey', JSON.parse(error.response.text).error.errorKey)
            console.log('Error during the upload' + error);
            //result.push(error);
            result.push({'status': 409, 'message': JSON.parse(error.response.text).error.errorKey });
        });
      }
      
      res.json(result)

    });




const initRoutes = require('./routes');

app.use(express.urlencoded({ extended: true }));
initRoutes(app);

let port = 3010;
app.listen(port, () => {
  console.log(`Running at localhost:${port}`);
});
