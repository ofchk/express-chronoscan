

const cors = require('cors');
const express = require('express');
const multer = require('multer');
const path = require('path');
var throttle = require('express-throttle-bandwidth');

const oracledb = require('oracledb');

const dbConfig = require('./dbconfig.js');

const fs = require('fs-extra');
global.__basedir = __dirname;

const app = express();

app.use(cors());
app.use(express.static('static'));
app.use(throttle(100000));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const db = require("./models");
const Role = db.role;

db.sequelize.sync();

var pathFrom = `${__dirname}/uploads`; // Or wherever your files-to-process live
var pathTo = `${__dirname}/uploads`;

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

function save_staging(
  invoice_id, staging_id
) {

  fetch("http://192.168.5.130:8080/v1/graphql", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'chronoaccesskey001',
    },
    body: JSON.stringify({
      query: `mutation{ insert_staging_one(object: {invoice_id: "${invoice_id}", staging_document_identifier: "${staging_id}"}) {
        id
        invoice_id
        staging_document_identifier
      }}`,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
      console.log('res',res)
      console.log(
        `File Failed details added to hasura: ${JSON.stringify(res.data.update_invoice_by_pk.id)}`
      );      
    })
    .catch((error) => {
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}



async function connect_oracle_staging(invoice_number, vendor_name, site_id, currency, entity_name, amount, contentUrl, gl_date) {

  let connection;

  try {

    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");
//    sql = `INSERT INTO "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T" (INVOICE_NUM) VALUES ('Sample')`;    
//    result = await connection.execute(sql);
//    console.log("Number of rows inserted:", result);

   sql = `INSERT INTO "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T" (INVOICE_NUM, VENDOR_NAME, VENDOR_SITE_ID, HEADER_CURRENCY, OPERATING_UNIT, ENTERED_AMOUNT, GL_DATE, INVOICE_DATE) VALUES (:1,:2,:3,:4,:5,:6,DATE :7,DATE :7)`;


    binds = [
      [ invoice_number, vendor_name, site_id, currency, entity_name, amount, gl_date ]
    ];

    options = {
      autoCommit: true,
      // batchErrors: true,  // continue processing even if there are data errors
      bindDefs: [
        { type: oracledb.STRING, maxSize: 200 },
        { type: oracledb.STRING, maxSize: 200 },
        { type: oracledb.NUMBER },
        { type: oracledb.STRING, maxSize: 200 },
        { type: oracledb.STRING, maxSize: 200 },
        { type: oracledb.NUMBER },
        { type: oracledb.DATE },
      ]
    };

//{ type: oracledb.NUMBER },

    result = await connection.executeMany(sql, binds, options);
    console.log("Number of rows inserted:", result);

// result2 = await connection.execute('select * from  "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T"')
// console.log("Fetch: ", result2.rows)

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}

connect_oracle_staging("StagingSample444" ,"Al NahlaSolutions LLC 98765", 106, "OMR","Muscat Overseas Engineering LLC", 1357, '2023-05-10')


function doc_dicer(itemPath){
  try {            
      console.log(itemPath) 
      var pdfDicer = require('pdf-dicer');      
      var dicer = new pdfDicer();
      var fullPathFrom = itemPath;
      console.log('fullPathTo',fullPathFrom)
      dicer.on('split', (data, buffer) => {
        var fullPathTo = path.join(pathTo, data.barcode.id + '.pdf');
        console.log('fullPathTo',fullPathTo)
        fs.writeFile(fullPathTo, buffer);
      }).split(fullPathFrom, function(err, output) {
            if (err){
              console.log(`Something went wrong: ${err}`);
              console.log(err);
              console.log(output);
            } 
      });
    res.json({ 'status': 200, mesaage: 'File upload is completed.' });
  } catch (err) {        
    res.status(500).send({
      message: `Error - Could not upload the file:  ${err} `,
    });
  }  
};

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
        `Alfresco data addded to hasura: ${JSON.stringify(res.data.insert_files_one.invoice_number)}`
      );      
    })
    .catch((error) => {
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}

function save_doc_fail(
  invoice_id
) {

  fetch("http://192.168.5.130:8080/v1/graphql", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'chronoaccesskey001',
    },
    body: JSON.stringify({
      query: `mutation{ update_invoice_by_pk(pk_columns: {id: "${invoice_id}"}, _set: {uploading_status: 3}) {
      id
    }}`,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
      console.log('res',res)
      console.log(
        `File Failed details added to hasura: ${JSON.stringify(res.data.update_invoice_by_pk.id)}`
      );      
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
    //userDn: 'dmssharing@moc.com',
    //userPassword: 'Tws3857RTY4',
    userDn: 'dmstest1@moc.com',
    userPassword: 'tEsT98564TRW',
    userSearchBase: 'DC=moc,DC=com',
    username: 'dmstest1@moc.com',
    usernameAttribute: 'userPrincipalName',
    attributed: ['dn','sAMAccountName']
  };

  let user = await authenticate(options)
    //	.then(response =>  response.json())
    .then((data) => {
      console.log(data);
    })
    .catch((err) => {
      console.log(err);
    });
  //console.log(user);
  //console.log(user.row)
}

//auth()

app.post('/user/login', async (req, res) => {
  try {      
    console.log(req.body)
      const email = req.body.email;
      const password = req.body.password;

      let options = {
        ldapOpts: {
          url: 'ldap://192.168.5.10:389',
        },
        baseDN: 'DC=moc,DC=com',    
        //userDn: 'dmssharing@moc.com',
        //userPassword: 'Tws3857RTY4',
        userDn: email,
        userPassword: password,
        userSearchBase: 'DC=moc,DC=com',
        username: email,
        usernameAttribute: 'userPrincipalName',
        attributed: ['dn','sAMAccountName']
      };

      let user = await authenticate(options)
        //  .then(response =>  response.json())
        .then((data) => {
          console.log(data);
          res.json({ 'status': 200, name: data.name, email: data.userPrincipalName, mesaage: 'Login Successfully' });
        })
        .catch((err) => {
          console.log(err);
          res.json({ mesaage: 'LDAP Auth Error' });
        });

    
  } catch (err) {    
    console.log(err)
    res.status(500).send({
      message: `Error - Login Failed. `,
    });
  }  
});

app.post('/invoice/upload', upload.single('file'), async (req, res) => {
  try {      
      const invoice_number = req.body.invoice;
      const invoice_id = req.body.invoice_id;
      const amount = parseInt(req.body.amount);
      const vendor_name = req.body.vendor_name;
      const entity_name = req.body.entity_name;
      const currency = req.body.currency;
      const site_code = parseInt(req.body.site_id);
      const gl_date = req.body.gl_date;
      // const option = req.body.option;      

      console.log(req.body);

      // if(option != 3){
      //   doc_dicer(req.file.path)
      // }

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
        var fileToUpload = fs.createReadStream(req.file.path);
        await alfrescoJsApi.upload
          .uploadFile(fileToUpload, '/Sites/AccountsPayable/documentLibrary/' + invoice_number)

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
              console.log(invoice_number, vendor_name, site_code, currency, gl_date, entity_name, amount, contentUrl);
              const oracle = connect_oracle_staging(invoice_number, invoice_id, vendor_name, site_code, currency, gl_date, entity_name, amount, contentUrl)
              
              console.log('oracle',oracle);

              result.push({
                status: 200,
                invoice_number: invoice_number,
                entryid: response.entry.id,
                filename: filename,
                nodeid: nodeid,
                contentUrl: contentUrl,
                message: 'File - ' + filename + ' uploaded to Alfresco successfully',
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
    res.json({ 'status': 200, mesaage: 'File upload is completed.' });
  } catch (err) {    
    save_doc_fail(req.body.invoice_id)
    res.status(500).send({
      message: `Error - Could not upload the file with Invoice Number:  ${req.body.invoice} `,
    });
  }  
});

const initRoutes = require('./routes');

initRoutes(app);
require('./routes/auth.routes')(app);
// require('./routes/user.routes')(app);

let port = 3010;
app.listen(port, () => {
  console.log(`Running at localhost:${port}`);
});
