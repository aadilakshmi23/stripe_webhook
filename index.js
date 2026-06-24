require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const Stripe = require('stripe');

const User = require('./models/User');

const PORT = process.env.PORT || 5000;

const app = express();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

mongoose.connect(process.env.DB_URI).then(() => {
     console.log('db connected')
}).catch((err) => {
     console.log('err in db connection', err)
})


// stripe webhook

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
     const signature = req.headers['stripe-signature'];

     let event;

     try {
          event = stripe.webhooks.constructEvent(
               req.body,
               signature,
               process.env.STRIPE_WEBHOOK_SECRET
          )
     } catch (error) {
          console.log('webhook error', error)
          return res.status(400).send('webhook error', error.message)
     }

     if (event.type === 'checkout.session.completed') {
          const userEmail = session.customer_details.email;

          try {
               await User.findOneAndUpdate({
                    email: userEmail
               }, {
                    stripeCustomerId: session.customer,
                    isPremium: true,
                    subscriptionId: session.subscription || null
               });
               console.log('payment successful of user with email' + userEmail);
          } catch (error) {
               console.error('error updating database')
          }
     }

     res.json({ received: true })
})





app.use(express.json())


app.post('/api/checkout', async (req, res) => {
     const { email, priceId } = req.body;

     const user = await User.findOne({ email });
     if (!user) {
          return res.status(404).json({ message: 'user not found' })
     }

     const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'subscription',
          customer_email: email,
          line_items: [
               {
                    price: priceId,
                    quantity: 1
               }
          ],
          success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/cancel`
     })

     res.json({url: session.url})
})

app.post('/api/signup', async (req, res) => {
     let { email, password } = req.body;
     try {
          email = email.trim().toLowerCase()
          const existingUser = await User.findOne({ email })
          if (existingUser) {
               return res.status(400).json({ message: 'user already exists' })
          }

          const newUser = await User.create({ email, password });
          res.status(201).json({
               message: 'user signedup successfully',
               user: newUser
          })
     } catch (error) {
          res.status(500).message('internal server error')
     }
})

app.listen(PORT, () => {
     console.log('server is running on ' + PORT)
})