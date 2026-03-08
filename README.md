## 145 Storage 2

My localStorage is a **Javascript  Object**

> A lightweight, intelligent storage library for JavaScript that makes state persistence as easy as modifying an object.

### 🚀 Never as easy

```js
import { WebStorageItemStorage } from "./storage.js";
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;//See?
console.info("Count:", settings.count);
```

See test.js for more examples. (Working in progress)

### 🗺 Roadmap
This project is still in development and should't be used in production.

- [x] JSON
- [x] LocalStorage
- [x] SessionStorage
- [ ] IndexedDB
- [ ] SyncStorage

XML storage was planned but not any more, I'm currently focusing on JSON.

Any kind of contribution is welcomed :)