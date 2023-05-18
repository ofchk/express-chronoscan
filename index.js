

const cors = require('cors');
const express = require('express');
const multer = require('multer');
const path = require('path');
var throttle = require('express-throttle-bandwidth');
var cron = require('node-cron');
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


async function fetch_vendor_entity() {
  let connection;
  try {
    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");
    
    sql = `SELECT * FROM XXDMS_SUPPLIER_V  `;    
    result = await connection.execute(sql);
    console.log("Result:", result.rows);
    if(result.rows.length > 0){
      const tempArray = [];
      for (let i = 0; i < result.rows.length; i++) {
        console.log(result.rows[i])
        tempArray.push({
          name: result.rows[i].SUPPLIER_NAME, 
          number: result.rows[i].SUPPLIER_NUMBER, 
          site_code: result.rows[i].VENDOR_SITE_ID
        })
        try{
          fetch("http://192.168.5.130:8080/v1/graphql", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hasura-admin-secret': 'chronoaccesskey001',
            },
            body: JSON.stringify({
              query: `mutation{ 
               insert_vendor(objects: ${tempArray}) {
                  affected_rows
                  returning {
                    id
                  }
                }
              }`,
            }),
          })
          .then((res) => res.json())
          .then((res) => {
            console.log('res',res)            
          })
          .catch((error) => {      
            console.log(
              'There has been a problem with your fetch operation: ',
              error
            );
          });
        }
        catch (err) {    
          console.error(err);
        } 
      }      
    }

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


fetch_vendor_entity()
// cron.schedule('15 * * * *', () => {
//   console.log(`Cron is running to fetch vendor`);
//   const res = fetch_vendor_entity()
// });



function error_log_to_hasura(
  invoice_id,  
  message
) {
  
  fetch("http://192.168.5.130:8080/v1/graphql", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'chronoaccesskey001',
    },
    body: JSON.stringify({
      query: `mutation{ insert_error_logs_one(object: {invoice_id: "${invoice_id}", message: "${message}"}) {
        id
      }}`,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
      console.log('res',res)
      console.log(
        `Error log added to hasura`
      );
    })
    .catch((error) => {      
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}

function save_oracle_identifier(
  invoice_id,  
  prod_id
) {
  
  fetch("http://192.168.5.130:8080/v1/graphql", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': 'chronoaccesskey001',
    },
    body: JSON.stringify({
      query: `mutation{ update_invoice_by_pk(pk_columns: {id: "${invoice_id}"}, _set: {oracle_document_identifier: "${prod_id}"}) {
      id
    }}`,
    }),
  })
    .then((res) => res.json())
    .then((res) => {
      console.log('res',res)
      console.log(
        `oracle_document_identifier added to hasura`
      );
    })
    .catch((error) => {
      error_log_to_hasura(invoice_id, "Adding Oracle Identifier to File Controller App has been failed.");
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}

async function get_oracle_identifier( invoice_id, rowid, task ) {
  let connection;
  try {
    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");
    
    sql = `SELECT ERP_DOC_NUMBER from XXMO_DMS_AP_INVOICE_STG_T where rowid='${rowid}'`;    
    result = await connection.execute(sql);
    console.log("Result:", result.rows[0][0]);
    if(result.rows[0][0]){
      save_oracle_identifier(invoice_id,result.rows[0][0])
      task.stop()
    }

  } catch (err) {
    error_log_to_hasura(invoice_id, "Fetch Staging Identifier from Staging table has been failed.");
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
        `Staging identifier details added to hasura`
      );            
      
////// #### cron
      var task = cron.schedule('*/15 * * * * *', () => {
        console.log(`Cron is running."${invoice_id}" - "${new Date()}"`);
        const res = get_oracle_identifier(invoice_id, staging_id, task)
      });

      setTimeout(function () {
        task.stop();
        error_log_to_hasura(invoice_id, "Oracle Identifier not found.");
        console.log(`Cron Stopped."${invoice_id}" - "${new Date()}"`);
      }, 360000)      
    })
    .catch((error) => {
      error_log_to_hasura(invoice_id, "Adding Staging identifier to File Controller App has been failed.");
      console.log(
        'There has been a problem with your fetch operation: ',
        error
      );
    });
}

async function connect_oracle_staging(invoice_number, vendor_name, site_id, currency, entity_name, amount, gl_date, contentUrl, invoice_id ) {

  let connection;

  try {

    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");

   sql = "INSERT INTO XXMO_DMS_AP_INVOICE_STG_T (INVOICE_NUM, VENDOR_NAME, VENDOR_SITE_ID, HEADER_CURRENCY, OPERATING_UNIT, ENTERED_AMOUNT, GL_DATE, INVOICE_DATE, ATTRIBUTE9) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9)";

    binds = [invoice_number, vendor_name, site_id, currency, entity_name, amount, gl_date, gl_date, contentUrl];    

    options = {
      autoCommit: true,
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      // batchErrors: true,  // continue processing even if there are data errors
      // bindDefs: [
      //   { type: oracledb.STRING, maxSize: 200 }

      // ]
    };

//{ type: oracledb.NUMBER },

    //result = await connection.execute(sql, binds,  options);

    result = await connection.execute(
                sql,
                binds,
                options);
    console.log("Inserted Row ID:", result.lastRowid);
    save_staging(invoice_id, result.lastRowid)

// result2 = await connection.execute('select * from  "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T"')
// console.log("Fetch: ", result2.rows)

  } catch (err) {
    error_log_to_hasura(invoice_id, "Adding invoice data to Staging table has been failed.");
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
      error_log_to_hasura(invoice_id, "Adding Alfresco upload success details to File Controller App has been failed.");
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
        `Alfresco upload error details added to hasura: ${JSON.stringify(res.data.update_invoice_by_pk.id)}`
      );      
    })
    .catch((error) => {
      error_log_to_hasura(invoice_id, "Adding Alfresco upload failed details to File Controller App has been failed.");
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
              console.log(invoice_number, vendor_name, site_code, currency, entity_name, amount, gl_date);
              const oracle =  connect_oracle_staging(invoice_number, vendor_name, site_code, currency, entity_name, amount, gl_date, contentUrl, invoice_id)
              
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
              error_log_to_hasura(invoice_id, "Upload document to Alfresco has been failed.");
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
    error_log_to_hasura(invoice_id, "Upload document to server has been failed.");
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
