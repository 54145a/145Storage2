## 145 Storage 2

My localStorage is a **Javascript  Object**

> A lightweight, intelligent storage library for JavaScript that makes state persistence as easy as modifying an object.

### 🚀 Never as easy

```js
import { WebStorageItemStorage } from "./storage.js";
const settings = new WebStorageItemStorage("settings", localStorage).data;
settings.count = settings.count ? settings.count + 1 : 1;
console.info("Count:", settings.count);
```

See test.js for more examples. (Working in progress)

### 🗺 Roadmap
This project is still in development and should't be used in production.

- [x] JSON
- [x] LocalStorage
- [ ] XML
- [ ] IndexedDB
- [ ] File System
- [ ] SQL
- [ ] First Release

![not by ai](https://i0.hdslb.com/bfs/new_dyn/9db9da973beb8dce14ecfe050e0a75713546740225476826.png)