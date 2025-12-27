## 145 Storage 2
My localStorage is a Javascript object :)

```js
import { StorageHelper } from "./node_modules/145-storage-2/storage.js";
const storage = new StorageHelper();
const settings = storage.getLocalStorage("settings");
settings.foo = "Hello, 145 Storage!";
```

This project is still in development and should't be used in production.
### Roadmap
- [x] Remake 145 Storage
- [x] LocalStorage
- [ ] Indexed DB
- [ ] SQL
- [ ] Release