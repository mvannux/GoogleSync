# GoogleSync

. creare progetto su google:
  Nella console Google Cloud, vai a Menu menu > IAM e amministrazione > Crea un progetto.
  https://console.cloud.google.com/projectcreate?hl=it
  
. abilitare api google drive
  Nella console Google Cloud, vai a Menu menu > Altri prodotti > Google Workspace > Libreria prodotti
  
. creare credenziali "ID client OAuth 2.0"
  Nella console Google Cloud, vai a Menu menu > API e servizi > Schermata consenso OAuth.
  

. scaricare col nome "credentials.json"
https://console.cloud.google.com/apis/credentials?project=sincronizza-drive

in caso di `GaxiosError: invalid_grant` eliminare "token.json"

```sh
node sync.js -l <LocalFullPathFile> -r <remoteFileName>
node utils.js upload -l <LocalFullPathFile> -r <remoteFileName>
```  
