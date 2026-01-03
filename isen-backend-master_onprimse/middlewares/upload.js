const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ Existing Avatar Storage (UNCHANGED)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const fileName = 'avatar-' + Date.now() + path.extname(file.originalname);
        cb(null, fileName);
        req.savedAvatarPath = '/uploads/' + fileName;
    }
});

// ✅ New Chat Storage (ADDED)
const chatStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadPath = path.join(__dirname, '..', 'public', 'upload_chat');
      // Ensure directory exists asynchronously and then call cb
      fs.promises.mkdir(uploadPath, { recursive: true })
        .then(() => cb(null, uploadPath))
        .catch(err => cb(err));
    },
    filename: function (req, file, cb) {
      const fileName = 'chat-' + Date.now() + path.extname(file.originalname);
  
      // ✅ Set savedChatPath before cb
      req.savedChatPath = '/upload_chat/' + fileName;
      console.log(`Chat file will be saved as: ${fileName}`);
  
      cb(null, fileName);
    }
  });
  

// ✅ Multer instances
const upload = multer({ storage: storage }); // for avatar (unchanged)
const chatUpload = multer({ storage: chatStorage }); // for chat media

module.exports = {
    upload,       // avatar upload (unchanged, backward compatible)
    chatUpload    // new chat media upload
};
