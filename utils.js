// https://developers.google.com/drive/api/guides/manage-uploads?hl=it

const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const createReadStream = require('fs').createReadStream;
const createWriteStream = require('fs').createWriteStream;

// If modifying these scopes, delete token.json.
// https://developers.google.com/drive/api/guides/api-specific-auth?hl=it
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

function getDrive(authClient) {
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Files:');
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

async function getRemoteFileStats(authClient, fileName) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  try {
    const res = await drive.files.list({
      // pageSize: 10,
      // fields: 'nextPageToken, files(id, name)',
      q: `name='${fileName}' and trashed=false`,

      fields: 'files(id,name,modifiedTime)',
    });
    const files = res.data.files;
    if (files.length === 0) {
      console.log('No files found.');
      return null;
    }

    // console.log('Files:');
    // files.map((file) => {
    //   console.log(`${file.name} (${file.id}) ${file.modifiedTime}`);
    // });
    return files[0];

  } catch (ex) {
    //console.error(ex);
    console.error("Try to delete 'token.json'");
    throw ex;
  }
}

/**
 * returns id, name
 */
function createFolder(authClient, folderName) {
  var drive = getDrive(authClient);
  return drive.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
  });
}

async function deleteFile(authClient, fileId) {
  const drive = getDrive(authClient);
  return await drive.files.delete({
    fileId
  });
}

/**
 * Create remote file
 */
async function createFile(authClient, localFilePath, localFileStats, remoteFileName) {
  console.log("Create remote file");
  const drive = getDrive(authClient);

  const requestBody = {
    name: remoteFileName,
    fields: 'id',
    //modifiedTime: localFileStats.mtime,
    //modifiedByMeTime: localFile.mtime
  };
  if (localFileStats) requestBody.modifiedTime = localFileStats.mtime;

  const media = {
    mimeType: "application/octet-stream",
    body: createReadStream(localFilePath),
  };
  const response = await drive.files.create({
    requestBody: requestBody,
    media: media,
    fields: 'id',
  });
  console.log('File caricato con successo, ID:', response.data.id);
}

/**
 * Update RemoteFile
 */
async function updateRemoteFile(authClient, localFilePath, localFileStats, remoteFileId) {
  console.log("Update file");
  const drive = getDrive(authClient);

  const requestBody = {
    fields: 'id',
    modifiedTime: localFileStats.mtime,
    //modifiedByMeTime: localFile.mtime
  };
  const media = {
    mimeType: "application/octet-stream",
    //mimeType: "text/plain",
    body: createReadStream(localFilePath),
  };
  const response = await drive.files.update({
    fileId: remoteFileId,
    requestBody: requestBody,
    media: media,
    fields: 'id',
  });
  console.log('File caricato con successo, ID:', response.data.id);
}

/**
 * Download file
 */
async function downloadFile(authClient, localFilePath, remoteFileId, remoteModifiedTime) {
  console.log("Download file in " + localFilePath);
  const drive = getDrive(authClient);
  const localfile = createWriteStream(localFilePath)
  const resp = await drive.files.get({
    fileId: remoteFileId,
    alt: "media",
  }, { responseType: "stream" },
    (err, stat) => {
      stat.data
        .on("end", async () => {
          const newdate = new Date(remoteModifiedTime)
          await fs.utimes(localFilePath, newdate, newdate);
          console.log("Done");
        })
        .on("error", err => {
          console.log("Error during download", err);
        })
        .pipe(localfile);
    });
}

async function sync(localFilePath, remoteFile) {
  const authClient = await authorize();
  const remoteFileStats = await getRemoteFileStats(authClient, remoteFile);
  let localFileStats;
  try {
    localFileStats = await fs.stat(localFilePath);
  }
  catch { }

  // if (!folder) {
  //   folder = await googleDriveService.createFolder(folderName);
  // }

  // TEST: delete
  // if (remoteFile) {
  //   await deleteFile(authClient, remoteFile.id);
  //   console.log("File deleted", REMOTE_FILENAME);
  //   remoteFile = null;
  // }

  if (!remoteFileStats) {
    await createFile(authClient, localFilePath, localFileStats, remoteFile);
    return;
  }

  if (!localFileStats) {
    await downloadFile(authClient, localFilePath, remoteFileStats.id, mr);
    return;
  }

  var ml = localFileStats.mtime.getTime();
  var mr = new Date(remoteFileStats.modifiedTime).getTime();

  // console.log(localFileStats.mtime, remoteFileStats.modifiedTime
  //   , ml, mr
  //   , ml > mr
  //   , ml < mr)

  if (ml > mr)
    await updateRemoteFile(authClient, localFilePath, localFileStats, remoteFileStats.id);
  else if (ml < mr)
    await downloadFile(authClient, localFilePath, remoteFileStats.id, mr);
  else
    console.log("Files are equals");
}

async function upload(localFilePath, remoteFile) {
  const authClient = await authorize();
  const remoteFileStats = await getRemoteFileStats(authClient, remoteFile);
  let localFileStats;
  try {
    localFileStats = await fs.stat(localFilePath);
  }
  catch {
    console.error("Local file found")
    return
  }

  if (!remoteFileStats) {
    await createFile(authClient, localFilePath, localFileStats, remoteFile);
    return;
  }
  var ml = localFileStats.mtime.getTime();
  var mr = new Date(remoteFileStats.modifiedTime).getTime();

  if (ml > mr)
    await updateRemoteFile(authClient, localFilePath, localFileStats, remoteFileStats.id);
  else
    console.log("Files are equals");
}

async function download(localFilePath, remoteFile) {
  const authClient = await authorize();
  const remoteFileStats = await getRemoteFileStats(authClient, remoteFile);
  let localFileStats;
  try {
    localFileStats = await fs.stat(localFilePath);
  }
  catch { }

  if (!remoteFileStats) {
    console.error("Remote file not found")
    return;
  }

  if (!localFileStats) {
    await downloadFile(authClient, localFilePath, remoteFileStats.id, mr);
    return;
  }

  var ml = localFileStats.mtime.getTime();
  var mr = new Date(remoteFileStats.modifiedTime).getTime();

  if (ml < mr)
    await downloadFile(authClient, localFilePath, remoteFileStats.id, mr);
  else
    console.log("Local file is equals to remote file " + localFilePath);
}

process.on('warning', (warning) => {
  console.log(warning.stack);
});


let remoteFilePath, localFilePath;
let isUpload = false;
let isDownload = false;
for (let i = 2; i < process.argv.length; i++) {
  switch (process.argv[i]) {
    case "-l":
      localFilePath = process.argv[++i];
      break;
    case "-r":
      remoteFilePath = process.argv[++i];
      break;
    case "upload":
      isUpload = true;
      break;
    case "download":
      isDownload = true;
      break;
    default:
      throw new Error("unknown arg");
  }
}

if (!localFilePath)
  throw new Error("Missing -l localFilePath");
if (!localFilePath)
  throw new Error("Missing -r remoteFilePath");

if (isDownload) {
  download(localFilePath, remoteFilePath)
}
if (isUpload) {
  upload(localFilePath, remoteFilePath)
}
if (!isUpload && !isDownload) {
  console.info("No upload neither download")
}

