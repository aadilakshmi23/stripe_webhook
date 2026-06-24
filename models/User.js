const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
     email: {
          type: String,
          required:true,
          unique:true,
          trim:true,
          lowercase:true
     },
     password: {
          type: String,
          required:true
     },
     stripeCustomerId: {
          type: String,
          default: null
     },
     isPremium: {
          type: Boolean,
          default: false
     },
     subscriptionId:{
          type: String,
          default: null
     }
}, {
     timestamps:true
})

module.exports = mongoose.model('User', userSchema)
