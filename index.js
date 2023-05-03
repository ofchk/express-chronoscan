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

const { authenticate } = require('ldap-authentication')

async function auth() {
  // auth with admin
  let options = {
    ldapOpts: { 
      url: 'ldap://192.168.5.10:389' 
    },
    userDn: 'DC=moc,DC=com',
    userPassword: 'Tws3857RTY4',
    userSearchBase: 'OU/=MOG-CORP-GROUP,OU/=MOG_CORP_WITHOUT-USB,OU/=MOG_CORP_Finance',
    userSearchBase: 'OU/=UMS-OMAN,OU/=UMS_WITHOUT-USB,OU/=UMS_Finance',
    userSearchBase: 'OU/=ALTAMMAN-RE,OU/=ALTAMMAN_RE_WITHOUT-USB,OU/=Altamman_Finance',
    usernameAttribute: 'uid',
    username: 'dmssharing',
    attributes: ['dn', 'sn', 'cn'],
  }

  let user = await authenticate(options)
  console.log(user)
}

auth()


// app.post('/alfresco/upload', upload.single('file'), async(req, res) => {
//         var AlfrescoApi = require('alfresco-js-api-node');

//         var alfrescoJsApi = new AlfrescoApi({ provider:'ECM', hostEcm: 'http://alfresco.moc.com:8080' });

//         alfrescoJsApi.login("admin", "admin").then(function (data) {
//           console.log('API called successfully to login into Alfresco Content Services.');
//         }, function (error) {
//           console.error('Trap error',error);
//         });

//         var fs = require('fs');
//         var result = [];
        
//         var fileToUpload = fs.createReadStream(req.file.path);
//         await alfrescoJsApi.upload.uploadFile(fileToUpload,'ChronoscanInvoices')
//         .then(function (response) {
//             const nodeid = response.entry.id;
//             const filename = response.entry.name;
//             console.log('File Uploaded in the ChronoscanInvoices');
//             //var previewUrl = alfrescoJsApi.content.getDocumentPreviewUrl(response.entry.id);
//                               var contentUrl = alfrescoJsApi.content.getContentUrl(response.entry.id);
//             console.log(contentUrl)
//             result.push({'status': 200, 'filename': filename, 'nodeid': nodeid, 'contentUrl': contentUrl, 'message': 'File - '+filename+' uploaded successfully' });
//         }, function (error) {
//             console.log('errorkey', JSON.parse(error.response.text).error.errorKey)
//             console.log('Error during the upload' + error);
//             //result.push(error);
//             result.push({'status': 409, 'message': JSON.parse(error.response.text).error.errorKey });
//         });
//         res.json(result);
//     });

app.post('/invoice/upload', upload.array('file', 4), async(req, res) => {
    const invoice_number = req.body.invoice;
    var AlfrescoApi = require('alfresco-js-api-node');

    var alfrescoJsApi = new AlfrescoApi({ provider:'ECM', hostEcm: 'http://alfresco.moc.com:8080' });

    alfrescoJsApi.login('admin', 'admin').then(function (data) {
      console.log('API called successfully to login into Alfresco Content Services.');
    }, function (error) {
      console.error(error);
      res.json({ 'status' : 400, 'message': "Error in Alfresco Connection." })
    });

      var fs = require('fs');
      var result = [];
      for(var i = 0; i < req.files.length; i++){
        var fileToUpload = fs.createReadStream(req.files[i].path);
        await alfrescoJsApi.upload.uploadFile(fileToUpload,'ChronoscanInvoices/'+invoice_number)
        .then(function (response) {
            const nodeid = response.entry.id;
            const filename = response.entry.name;
            console.log('File Uploaded in the ChronoscanInvoices');
            //var previewUrl = alfrescoJsApi.content.getDocumentPreviewUrl(response.entry.id);
            var contentUrl = alfrescoJsApi.content.getContentUrl(response.entry.id);
            console.log(contentUrl)
            result.push({'status': 200, 'invoice_number': invoice_number, 'entryid': response.entry.id, 'filename': filename, 'nodeid': nodeid, 'contentUrl': contentUrl, 'message': 'File - '+filename+' uploaded successfully' });
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
