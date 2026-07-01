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

          const session = event.data.object;
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
     console.log(`${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`)
     console.log(`${process.env.CLIENT_URL}/cancel`)

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
          cancel_url: `${process.env.CLIENT_URL}/failure`
     })

     res.json({ url: session.url })
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

app.get('/success', (req, res) => {
     const htmlData = `
     <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Successful</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 100px;
            background-color: #f4f4f9;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            display: inline-block;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2ecc71;
        }
        p {
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Payment Successful!</h1>
        <p>Thank you for your purchase. Your transaction was completed successfully.</p>
    </div>
</body>
</html>

     `
     res.send(htmlData)
})

  async function getAllPastReceipts(subscriptionId) {
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    limit: 10, // Adjust based on how many past receipts you want
  });

  // Map through invoices to get a history of links
  return invoices.data.map(invoice => ({
    date: new Date(invoice.created * 1000).toLocaleDateString(),
    amount: invoice.amount_paid / 100, // Convert cents to dollars/currency
    viewUrl: invoice.hosted_invoice_url,
    downloadUrl: invoice.invoice_pdf
  }));
}

app.get('/api/invoices', async(req, res) => {
     const email = req.query.email;

     const user = await User.findOne({email});
     if(!user){
          return res.status(404).json({message: 'user not found'});
     }
     const invoices = await getAllPastReceipts(user.subscriptionId);
     res.json({
          success:true,
          invoices
     })
})

async function getSubscriptionReceiptLinks(subscriptionId) {
  // 1. Retrieve subscription and expand the latest invoice object
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });

  const latestInvoice = subscription.latest_invoice;

  // 2. Extract the view and download URLs
  const viewReceiptUrl = latestInvoice.hosted_invoice_url;
  const downloadPdfUrl = latestInvoice.invoice_pdf;

  console.log(`👁️ View Web Receipt: ${viewReceiptUrl}`);
  console.log(`📥 Download PDF Receipt: ${downloadPdfUrl}`);

  return { viewReceiptUrl, downloadPdfUrl };
}

app.get('/api/invoices-test', async(req, res) => {
     const email = req.query.email;

     const user = await User.findOne({email});
     if(!user){
          return res.status(404).json({message: 'user not found'});
     }
     const invoice = await getSubscriptionReceiptLinks(user.subscriptionId);
     res.json({
          success:true,
          invoice
     })
})


app.get('/failure', (req, res) => {
     const htmlData = `
     <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Successful</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 100px;
            background-color: #f4f4f9;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            display: inline-block;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2ecc71;
        }
        p {
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Payment Failed!</h1>
        <p>Your Payment has been failed.</p>
    </div>
</body>
</html>

     `
     res.send(htmlData)
})

app.listen(PORT, () => {
     console.log('server is running on ' + PORT)
})