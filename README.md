# garfield api

## Prerequisites

- `node@^10.1.0`
- `yarn@^1.6.0`

## Setup

- `git clone`
- `npm i`
- `npm start`
- <http://localhost:8080/>

## Tests 
i dont know why you'd even bother testing this shit but like... 

- `npm test`
- `npm tdd`

## Security Setup

- `/review` requires a cookie named `bone`
  - The value should be some base64 encoded text that, when hashed with bcrypt, matches the hash stored in a file named `secret.json` located in the project root folder
  - The json in `secret.json` should be like this:
    -  `{"secret": "<put hash here>"}`
  - Use [bcrypt-cli](https://www.npmjs.com/package/bcrypt-cli) to hash the password to store in the `secret.json`
  - Example cookie header:
    - `Cookie: bone=cGFzc3dvcmQ=`

## API

On the `GET /garf`, `GET /garf.json`, and `GET /garfields` endpoints, you may add a query parameter called `filter` which should have 1 or more file extensions, separated by commas. When hitting any of the above 3 endpoints with the `filter` param, that endpoint will only return dogs that do not have one of the filtered extensions. There is also an `include` query param that does the opposite of `filter`.

Example: `GET localhost:8080/garf?filter=mp4,webm` will only return dogs that do not have an extension of `mp4` or `webm`.

Example: `GET random.dog/garf?include=mp4,webm` will only return dogs that do have an extension of `mp4` or `webm`.
