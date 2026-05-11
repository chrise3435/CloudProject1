// server.js (Node.js) = handles backend requests to generate presigned URLs 
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import express from "express";
import cors from "cors";
import 'dotenv/config';
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { SecretsManagerClient, GetSecretValueCommand } 
  from "@aws-sdk/client-secrets-manager";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import session from "express-session";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


 //getting session secret key 

  async function getSessionSecret() { // this function retrieves the session secret key from AWS Secrets Manager, this is to ensure that the session secret key is securely stored in AWS Secrets Manager and not hardcoded in the code, allowing for easier management of the secret key without needing to change the code
    const client = new SecretsManagerClient({ region: "ap-southeast-2" }); // Create a Secrets Manager client, this is used to interact with AWS Secrets Manager to retrieve the session secret key
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: "myapp/session-secret"
      })
    );

    return response.SecretString;
  }


app.use(session({
  secret: await getSessionSecret(),
  resave: false,
  saveUninitialized: false
}));


const corsOptions = {
  origin: 'http://localhost:3000',
  // "http://${aws_eip.app_eip.public_ip}:3000" ##also planning on using EC2's elastic IP in the CORS configuration in order for S3 bucket to communicate with EC2 without hardcoding the IP
  optionsSuccessStatus: 200,
}; 
app.use(cors(corsOptions)); 
app.use(express.json());

function authMiddleware(req, res, next) {
  console.log("This is the session object in authMiddleware:", req.session.userId); // this is to log the session object for debugging purposes, it helps to confirm that the session management is working correctly and can be useful for troubleshooting issues related to user authentication by providing detailed information about the session state in the server logs
  if (req.session.userId) {
    next()
  } else {
    res.redirect('/loginpage.html')
  }
}

app.get("/homepage.html", authMiddleware, (req, res) => { // this is to ensure only logged in users can access the homepage, if they are not logged in they will be redirected to the login page
  res.sendFile(path.join(__dirname, "files", "homepage.html"));
});

app.use(express.static('files')); // this is to ensure server can show files from files folder, so when server starts all the files in 'files folder' will run
//import { Pool } from 'pg'; //this is for the connection pool to the database, it allows us to manage multiple connections to the database efficiently by reusing existing connections instead of creating new ones for each request
import mysql from 'mysql2/promise';
 // this is for the connection pool to the database, it allows us to manage multiple connections to the database efficiently by reusing existing connections instead of creating new ones for each request
import bcrypt from 'bcrypt'; // bcrypt is used for hashing passwords before storing them in the database for security
let pool;

async function getDbCredentials() { //this function gets the db credentials from AWS Secrets Manager, this is to ensure that the database credentials are not hardcoded in the code and are securely stored in AWS Secrets Manager, ensuring that the system won't break upon server startup due to missing environment variables, and also allows for easier management of credentials without needing to change the code

  const client = new SecretsManagerClient({ region: "ap-southeast-2" }); // Create a Secrets Manager client, this is used to interact with AWS Secrets Manager to retrieve the database credentials
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: "rds_credentials"
    })
  );

  return JSON.parse(response.SecretString);
}

 async function getCognitoConfig() {

  const command = new GetSecretValueCommand({
    SecretId: "cognito/config"
  });

  const response = await client.send(command);

  const secret = JSON.parse(response.SecretString);

  return {
    userPoolId: secret.COGNITO_USER_POOL_ID,
    clientId: secret.COGNITO_CLIENT_ID,
    region: secret.AWS_REGION
  };
}

async function initializeDbconnection() { //this function initializes the database connection pool using the credentials retrieved from AWS Secrets Manager, this is called when the server starts to ensure that the database connection is established and ready to handle requests
  const credentials = await getDbCredentials();
    await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS cognito_migrated BOOLEAN DEFAULT false
  `);


   pool = mysql.createPool({
    host: credentials.host,
    user: credentials.username,
    password: credentials.password,
    database: credentials.dbname,
    port: credentials.port,
    //ssl:  { ca: fs.readFileSync(path.join(__dirname, "global-bundle.pem")).toString() }, // this is to ensure that the connection to the database is secure by using SSL and providing the CA certificate for verification
      waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  });

  console.log("Database connected TO :", credentials.host, "Under username : ", credentials.username, "Intended for: ", credentials.dbname, "not: ", credentials.database); // this is to log the successful connection to the database for debugging purposes, it helps to confirm that the database connection is established correctly and can be useful for troubleshooting issues related to database connectivity by providing confirmation in the server logs that the connection to the database was successful along with the host, username, and database name

}

//setting the default page which is login, this means the page that first shows up when the user opens webapp  
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "files", "loginpage.html"));
});

//app.get("/homepage.html", authMiddleware, (req, res) => { // this is to ensure only logged in users can access the homepage, if they are not logged in they will be redirected to the login page
//  res.sendFile(path.join(__dirname, "files", "homepage.html"));
//});

app.get("/createaccount.html", (req, res) => {
  res.sendFile(path.join(__dirname, "files", "createaccount.html"));

});
app.post("/get-presigned-url", async (req, res) => {
  try {
    const fileName = req.body.fileName;
    const fileType = req.body.fileType;

    const command = new PutObjectCommand({
      Bucket: "appimagesbucket-1234567890",
      Key: fileName,
      ContentType: fileType,
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 3600 });

    res.json({ uploadURL });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating URL");
  }
});



// logic for handling a user login request, this function is called when a user attempts to log in to the webapp
app.post('/api/login', async (req, res) => {
  
  const { username, password } = req.body;
    console.log("This is login for username", username, ":", password); // added extra line to see if this will output username and password for debugging and troubleshooting purposes
    const config = await getCognitoConfig();

  try {


  //TRY Cognito authentication first, if it fails then have user and password created in cognito using details
  // from RDS, once
  //that is done, have the password hash field set to NULL for user, and have a boolean field cfalled 
  //cognito_migrated set to true, so that when user tries to log in again, it will check if 
  // cognito_migrated is true, if it is, then it will try to authenticate with cognito, if it fails, then it will return an error message, if it succeeds, then it will set the password hash field to NULL and cognito_migrated to true, so that next time user tries to log in, it will only try to authenticate with cognito



     const cognitoResult = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: config.userPoolId,
        ClientId: config.clientId,

        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",

        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      })
    );

    console.log("Authenticated via Cognito")

        return res.json({
      success: true,
      redirect: "/homepage.html", //if user exists in cognito and password is correct, user is immediately taken to homepage
      tokens: cognitoResult.AuthenticationResult
    });

  } catch (cognitoErr) {

    console.log("Not yet migrated or Cognito login failed");
  }
  const credentials = await getDbCredentials();

 const db = new Pool({
     host: credentials.host,
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    port: credentials.port,
    ssl:  { ca: fs.readFileSync(path.join(__dirname, "global-bundle.pem")).toString() }, // this is to ensure that the connection to the database is secure by using SSL and providing the CA certificate for verification
      waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  });

  await db.connect();

  try {
    const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE username=?', [username]);
    console.log("This is the result of the database query for username", username, ":", rows); // this is to log the result of the database query for debugging purposes, it helps to confirm that the query is executed correctly and can be useful for troubleshooting issues related to user authentication by providing detailed information about the query result in the server logs
    if(rows.length === 0){
      return res.json({ success: false, message: "User not found" });
    }

    const storedHash = rows[0].password_hash;
    const match = await bcrypt.compare(password, storedHash);

    if(match){
        req.session.userId = rows[0].id;
        req.session.userName = username;

        //return res.json({ success: true, redirect: '/homepage.html' }); // redirect to homepage if login is successful, this is to ensure that the user is redirected to the homepage after a successful login, providing a better user experience by taking them directly to the main page of the webapp where they can access its features

        //migrate user to cognito if database credentials exists and password is correct, this is to ensure that users are migrated to Cognito for authentication, allowing for better security and scalability of the authentication system by leveraging AWS Cognito's features while still allowing existing users to log in with their current credentials and be seamlessly migrated to the new authentication system
        try { 
          await cognito.send(
            new AdminCreateUserCommand({
              UserPoolId: config.userPoolId,
              Username: username,
              TemporaryPassword: password,
              UserAttributes: [
                { Name: "email", Value: `${
                  username
                }@example.com` }
              ],
              MessageAction: "SUPPRESS"
            })
          );    
          console.log("User created in Cognito for username", username); // this is to log the successful creation of a user in Cognito for debugging purposes, it helps to confirm that the user migration to Cognito is working correctly and can be useful for troubleshooting issues related to user migration by providing confirmation in the server logs when a user is successfully created in Cognito

          await pool.query('UPDATE users SET password_hash=NULL, cognito_migrated=true WHERE id=?', [rows[0].id]);
          console.log("User record updated in database for username", username, "to set password_hash to NULL and cognito_migrated to true"); // this is to log the successful update of the user record in the database for debugging purposes, it helps to confirm that the user record is updated correctly after migration to Cognito and can be useful for troubleshooting issues related to user migration by providing confirmation in the server logs when the user record is successfully updated in the database after migration to Cognito
          return res.json({
            success: true,
            redirect: "/homepage.html", //if user is successfully migrated to cognito, they are immediately taken to homepage
          });
        } catch (migrationErr) {
          console.error("Error during migration to Cognito for username", username, ":", migrationErr);
          return res.json({ success: false, message: "Error migrating user to Cognito" });
        }


    } else {
      res.json({ success: false, message: "Incorrect password" });
    }

  } catch(err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


//
//// user account creation logic, this function is called when a user signs up to the web app
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  console.log("Received registration request for username:", username, "and password:", password, "and email:", email); // this is to log the registration request for debugging purposes, it helps to verify that the server is receiving the registration requests correctly and can be useful for troubleshooting issues related to user registration
  //console.log("This is the database :", pool.database); // this is to log the database, to see if it can be recognised as part of troubleshooting the 1046 “No database selected” error

  console.log("This is the database pool object:", pool); // this is to log the database pool object for debugging purposes, it helps to confirm that the database connection pool is initialized correctly and can be useful for troubleshooting issues related to database connectivity by providing confirmation in the server logs that the pool object is available and properly configured
  try {
    // Check if user exists
    const [rows] = await pool.query('SELECT * FROM users WHERE username=?', [username]);
    if (rows.length > 0) {
      return res.json({ success: false, message: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed password for username", username, "is:", hashedPassword); // this is to log the hashed password for debugging purposes, it helps to confirm that the password hashing process is working correctly and can be useful for troubleshooting issues related to password hashing by providing confirmation in the server logs when a password is successfully hashed

    // Insert into database
    const result = await pool.execute('INSERT INTO users(username, password_hash, email) VALUES(?, ?, ?)', [username, hashedPassword, email]);
    console.log("This is result:", result); // this is to log the successful registration of a user for debugging purposes, it helps to confirm that the user registration process is working correctly and can be useful for troubleshooting issues related to user registration by providing confirmation in the server logs when a user is successfully registered

    res.json({ success: true });
  } catch (err) {
    console.error("This is the error:", err); // this is to log any errors that occur during the registration process for debugging purposes, it helps to identify and troubleshoot issues related to user registration by providing detailed error information in the server logs
    res.status(500).json({ success: false, message: "Server error" });
  }
});



async function startServer() {
  await initializeDbconnection(); // Initialize the database connection before starting the server
app.listen(3000, "0.0.0.0", () => console.log("Server running on port 3000"));
}

startServer(); // Start the server after initializing the database connection