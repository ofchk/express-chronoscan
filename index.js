
const cors = require('cors');
const express = require('express');
const multer = require('multer');
const path = require('path');
var throttle = require('express-throttle-bandwidth');
const busboy = require('connect-busboy');
const fs = require('fs-extra');
global.__basedir = __dirname;

const app = express();

app.use(cors());
app.use(express.static('static'));
app.use(throttle(100000));

app.use(
  busboy({
    highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
  })
);

app.get('/', (req, res) => {
  res.sendFile(path.resolve('pages/index.html'));
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

const { authenticate } = require('ldap-authentication');

function save_doc_details(
  alfresco_url,
  invoice_id,
  invoice_number,
  filename,
  nodeid
) {

  fetch("http://192.168.5.130:8080/v1/graphql", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'chronoaccesskey001',
    },
    body: JSON.stringify({
      query: `mutation{ insert_files_one(object: {alfresco_url: "${alfresco_url}", created_by: 1, invoice_id: "${invoice_id}", invoice_number: "${invoice_number}", name: "${filename}", nodeid: "${nodeid}"}) {
      id
      invoice_id
      invoice_number
    } update_invoice_by_pk(pk_columns: {id: "${invoice_id}"}, _set: {uploading_status: 2}) {
      id
    }}`,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
console.log('res',res)
      console.log(
        `File Added for Invoice: ${JSON.stringify(res.data.insert_files_one.invoice_number)}`
      );
      response.header('Access-Control-Allow-Origin', '*');
      response.send(res.data);
    })
    .catch((error) => {
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}

async function auth() {
  // auth with admin
  let options = {
    ldapOpts: {
      url: 'ldap://192.168.5.10:389',
    },
    baseDN: 'DC=moc,DC=com',
    //  userDn: 'dmssharing@moc.com',
    //  userPassword: 'Tws3857RTY4',
    userDn: 'dmstest1',
    userPassword: 'tEsT98564TRW',
    userSearchBase: 'DC=moc,DC=com',
    userSearchBase:
      'MOG-CORP-GROUP/MOG_CORP_WITHOUT-USB/MOG_CORP_Finance/dmsgroup',
    groupClass: 'group',
    username: '*',
    usernameAttribute: 'sAMAccountName',
    attributes: [],
    groupSearchBase:
      'MOG-CORP-GROUP/MOG_CORP_WITHOUT-USB/MOG_CORP_Finance/dmsgroup',
  };

  let user = await authenticate(options)
    //	.then(response =>  response.json())
    .then((data) => {
      console.log(data);
    })
    .catch((err) => {
      console.log(err);
    });
  console.log(user);
  //console.log(user.row)
}

//auth()

app.post('/invoice/upload', upload.array('file', 4), async (req, res) => {
  const invoice_number = req.body.invoice;
  const invoice_id = req.body.invoice_id;
  console.log(req.body)
  var AlfrescoApi = require('alfresco-js-api-node');

  var alfrescoJsApi = new AlfrescoApi({
    provider: 'ECM',
    hostEcm: 'http://alfresco.moc.com:8080',
  });

  alfrescoJsApi.login('admin', 'admin').then(
    function (data) {
      console.log(
        'API called successfully to login into Alfresco Content Services.'
      );
    },
    function (error) {
      console.error(error);
      res.json({ status: 400, message: 'Error in Alfresco Connection.' });
    }
  );

  var fs = require('fs');
  var result = [];
  for (var i = 0; i < req.files.length; i++) {
    var fileToUpload = fs.createReadStream(req.files[i].path);
    await alfrescoJsApi.upload
      .uploadFile(fileToUpload, 'ChronoscanInvoices/' + invoice_number)
      .then(
        function (response) {
          const nodeid = response.entry.id;
          const filename = response.entry.name;
          console.log('File Uploaded in to Alfresco');
          //var previewUrl = alfrescoJsApi.content.getDocumentPreviewUrl(response.entry.id);
          var contentUrl = alfrescoJsApi.content.getContentUrl(
            response.entry.id
          );
          console.log(contentUrl);
          result.push({
            status: 200,
            invoice_number: invoice_number,
            entryid: response.entry.id,
            filename: filename,
            nodeid: nodeid,
            contentUrl: contentUrl,
            message: 'File - ' + filename + ' uploaded successfully',
          });
          save_doc_details(
            contentUrl,
            invoice_id,
            invoice_number,
            filename,
            nodeid
          );
        },
        function (error) {
          console.log(
            'errorkey',
            JSON.parse(error.response.text).error.errorKey
          );
          console.log('Error during the upload' + error);
          //result.push(error);
          result.push({
            status: 409,
            message: JSON.parse(error.response.text).error.errorKey,
          });
        }
      );
  }
  res.json({ mesaage: 'File Upload is progressing.' });
});

const initRoutes = require('./routes');

app.use(express.urlencoded({ extended: true }));
initRoutes(app);

let port = 3010;
app.listen(port, () => {
  console.log(`Running at localhost:${port}`);
});
