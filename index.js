

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


async function fetch_vendor() {
  let connection;
  try {
    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");
    console.log(new Date())
    sql = `SELECT * FROM XXDMS_SUPPLIER_V  `;    
    result = await connection.execute(sql);
    // console.log("Result:", result.rows);
    if(result.rows.length > 0){
      const tempArray = [];
      for (let i = 0; i < result.rows.length; i++) {         
        tempArray.push({
          name: result.rows[i][2], 
          number: result.rows[i][3], 
          site_code: result.rows[i][5]
        })
        try{
          fetch("http://192.168.5.130:8080/v1/graphql", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hasura-admin-secret': 'chronoaccesskey001',
            },
            body: JSON.stringify({
              query: `mutation Upsert( $update_columns: [vendor_update_column!] = [ name, number, supplier_name, supplier_number, site_code, org_id ]) {
                  insert_vendor(objects: {
                    name: "${result.rows[i][1]}",
                    number: "${result.rows[i][0]}",
                    supplier_name: "${result.rows[i][3]}", 
                    supplier_number: "${result.rows[i][2]}", 
                    site_code: "${result.rows[i][5]}",
                    org_id: "${result.rows[i][7]}",
                  }, 
                    on_conflict: {constraint: vendor_org_id_supplier_number_site_code_key, update_columns: $update_columns}) {
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
            console.log('res', res.data.insert_vendor.returning[0].id)
            console.log(new Date())
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

async function fetch_entity() {
  let connection;
  try {
    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");
    
    sql = `SELECT * FROM XXDMS_OPERATING_UNITS `;    
    result = await connection.execute(sql);
    // console.log("Result:", result.rows);
    if(result.rows.length > 0){
      const tempArray = [];
      for (let i = 0; i < result.rows.length; i++) {         
        tempArray.push({
          name: result.rows[i][2], 
          number: result.rows[i][3], 
          site_code: result.rows[i][5]
        })
        try{
          fetch("http://192.168.5.130:8080/v1/graphql", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hasura-admin-secret': 'chronoaccesskey001',
            },
            body: JSON.stringify({
              query: `
                mutation Upsert( $update_columns: [entity_update_column!] = [ title, org_id, secret_code ]) {
                  insert_entity(objects: {
                  title: "${result.rows[i][1]}", 
                  secret_code: "${result.rows[i][2]}",
                  org_id: "${result.rows[i][0]}"
                }, 
                    on_conflict: {constraint: entity_org_id_key, update_columns: $update_columns}) {
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
cron.schedule('13 */6 * * *', () => {
  console.log(`Cron is running to fetch vendor`);
  fetch_vendor()
});

cron.schedule('* */8 * * *', () => {
  console.log(`Cron is running to fetch entity`);
  fetch_entity()
});

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

async function connect_oracle_staging(invoice_id, params ) {
  console.log(invoice_id)
  let connection;

  try {

    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");

    const invoice_main = params.data.invoice
    const invoice_items = params.data.invoice_line_items

  for (let i = 0; i < params.data.invoice_line_items.length; i++) {  
      sql = "INSERT INTO XXMO_DMS_AP_INVOICE_STG_T (INVOICE_NUM, VENDOR_NAME, VENDOR_SITE_ID, HEADER_CURRENCY, OPERATING_UNIT, ENTERED_AMOUNT, GL_DATE, INVOICE_DATE, ATTRIBUTE9, PO_NUMBER, DESCRIPTION, QUANTITY, UNIT_SELLING_PRICE) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13)";

       console.log('sql', sql)
       const qty = parseFloat(invoice_items[i].qty) || 0
       const price = parseFloat(invoice_items[i].price) || 0
        binds = [invoice_main[0].invoice_number, invoice_main[0].invoice_vendor.name, invoice_main[0].invoice_vendor.site_code, invoice_main[0].invoice_currency.title, invoice_main[0].invoice_entity.title, parseFloat(invoice_main[0].invoice_amount), new Date(invoice_main[0].gl_date).toLocaleDateString(), new Date(invoice_main[0].gl_date).toLocaleDateString(), invoice_main[0].invoice_files[0].alfresco_url, invoice_items[i].LPO, invoice_items[i].description, qty, price ];    
    console.log('binds', binds)
        options = {
          autoCommit: true,
          outFormat: oracledb.OUT_FORMAT_OBJECT,      
        };

        result = await connection.execute(
                    sql,
                    binds,
                    options);
        console.log("Inserted Row ID:", result.lastRowid);
        save_staging(invoice_id, result.lastRowid)
  }  
   

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

// result2 = await connection.execute('select * from  "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T"')
// console.log("Fetch: ", result2.rows)


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
          res.json({ 'status': 200, name: data.name, email: data.userPrincipalName, username: data.sAMAccountName, mesaage: 'Login Successfully' });
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

async function connect_oracle_staging_from_chronoscan( invoice_number, lpo, d_number, d_date ) {
  let connection;
  try {

    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");

  
   // sql = "UPDATE XXMO_DMS_AP_INVOICE_STG_T  SET ( LPO_NUMBER = "${LPO}", DELIVERY_DATE="${d_date}", DELIVERY_NUMBER="${d_number}" ) WHERE INVOICE_NUM = "${invoice_number}";"
    
   //  binds = [];    

    sql = "INSERT INTO XXMO_DMS_AP_INVOICE_STG_T (INVOICE, LPO_NUMBER, DELIVERY_NUMBER, DELIVERY_DATE) VALUES (:1,:2,:3,:4)";

    binds = [invoice_number, lpo, d_number, d_date];

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

    result = await connection.execute( sql, binds, options);
    console.log("Chronoscan data in staging table UPDATED Row ID:", result.lastRowid);

// result2 = await connection.execute('select * from  "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T"')
// console.log("Fetch: ", result2.rows)

  } catch (err) {
    //error_log_to_hasura(invoice_id, "UPDATING invoice data to Staging table has been failed.");
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

async function connect_oracle_staging_item_list( invoice, item, unit, qty, rate, gross, vat ) {

  let connection;

  try {

    let sql, binds, options, result;
    connection = await oracledb.getConnection(dbConfig);
    console.log("connection");

   sql = "INSERT INTO INVOICE_LINE_ITEM_STG (INVOICE, ITEM_NAME, UNIT, QTY, RATE, GROSS, VAT) VALUES (:1,:2,:3,:4,:5,:6,:7)";

    binds = [invoice, item, unit, qty, rate, gross, vat];    

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
    console.log("Inserted Line Item Row ID:", result.lastRowid);
    //save_staging(invoice_id, result.lastRowid)

// result2 = await connection.execute('select * from  "XXMO_DMS"."XXMO_DMS_AP_INVOICE_STG_T"')
// console.log("Fetch: ", result2.rows)

  } catch (err) {
    //error_log_to_hasura(invoice_id, "Adding invoice line item data to Staging table has been failed.");
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

function save_invoice_line_item( invoice_number, LPO, delivery_number, delivery_date, date_of_supply, description, qty, price ) {
    fetch("http://192.168.5.130:8080/v1/graphql", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': 'chronoaccesskey001',
      },
      body: JSON.stringify({
        query: `mutation{ insert_invoice_line_items_one(object: 
        {
          invoice_number: "${invoice_number}", 
          LPO: "${LPO}",
          delivery_number: "${delivery_number}",
          delivery_date: "${delivery_date}",
          date_of_supply: "${date_of_supply}",
          description: "${description}",
          qty: "${qty}",
          price: "${price}"
        }) {
          id
          
        }}`,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        console.log('res',res)
        console.log(
          `Adding Invoice Line Item added to hasura`
        );            
          
      })
      .catch((error) => {
        error_log_to_hasura(invoice_id, "Adding Invoice Line Item to File Controller App has been failed.");
        console.log(
          'There has been a problem with your Adding Invoice Line Item operation: ',
          error
        );
      });
  }

app.post('/process', async (req, res) => {
  try {      
    const json = req.body
    console.log('req',req.body)
    console.log(json[0])
    console.log(json[1])

    for (let i = 0; i < json[1].line_items.length; i++) {   
      await save_invoice_line_item(json[0].invoice, json[0].LPO, json[0].d_number, json[0].d_date, json[0].date_supply, json[1].line_items[i].item, json[1].line_items[i].qty, json[1].line_items[i].rate)
    }


//####### Get Invoice Full data from Hasura

    fetch("http://192.168.5.130:8080/v1/graphql", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': 'chronoaccesskey001',
      },
      body: JSON.stringify({
        query: `query{ 
          invoice(where: {invoice_number: {_eq: "${json[0].invoice}"}}) {
            id
            invoice_number
            invoice_amount
            gl_date
            invoice_currency{
              title
            }
            invoice_vendor{
              name
              site_code
            }
            invoice_entity{
             title 
            }
            invoice_files{
              alfresco_url
            }
          }
          invoice_line_items(where: {invoice_number: {_eq: "${json[0].invoice}"}}) {
            id
            description
            qty
            price
            LPO
            delivery_number
            delivery_date
            date_of_supply
          }
        }`,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        console.log('res',res)
        console.log(
          `Fetch Invoice Data from hasura successfully`
        );    

        const oracle =  connect_oracle_staging(res.data.invoice[0].id,res)        
          
      })
      .catch((error) => {
        error_log_to_hasura(invoice_id, "Fetch Invoice Data from hasura has been failed.");
        console.log(
          'There has been a problem with your Fetch Invoice Data from hasura operation: ',
          error
        );
      });

    // connect_oracle_staging_from_chronoscan(json[0].invoice, json[0].LPO, json[0].d_number, json[0].d_date, json[0].date_supply )
    // connect_oracle_staging_item_list(json[0].invoice, json[1].line_items[0].item, json[1].line_items[0].unit, json[1].line_items[0].qty, json[1].line_items[0].rate, json[1].line_items[0].gross, json[1].line_items[0].vat)
  } catch (err) {    
    console.log('error',err)
    res.status(500).send({
      message: `Error - Process API Failed. `,
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
      
      const al_name = req.body.al_param1;
      const al_pass = req.body.al_param2;

      // const al_name = 'admin';
      // const al_pass = 'admin';

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

      alfrescoJsApi.login(al_name, al_pass).then(
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
              
              //const oracle =  connect_oracle_staging(invoice_number, vendor_name, site_code, currency, entity_name, amount, gl_date, contentUrl, invoice_id)
              
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
