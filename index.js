const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const app = express();
const cookieParser = require('cookie-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://animals-38e02.web.app',
      'https://animals-38e02.firebaseapp.com',
    ],
    credentials: true,
  })
);

app.use(express.json());

app.use(bodyParser.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.whh17.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = 'mongodb://localhost:27017';
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });

    const database = client.db('animels_pet');
    const userCollections = database.collection('users');
    const petCollections = database.collection('pets');
    const adopCollections = database.collection('adoptions');
    const donationollections = database.collection('donation');
    const paymentIntentsCollection = database.collection('payments');

    // Middleware to verify JWT
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;

      if (!token) {
        return res
          .status(401)
          .send({ message: 'Unauthorized access: No token provided.' });
      }

      jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res
            .status(403)
            .send({ message: 'Forbidden: Invalid or expired token.' });
        }

        req.user = decoded;
        next();
      });
    };

    // Route to generate JWT
    app.post('/jwt', (req, res) => {
      const { email } = req.body;

      const token = jwt.sign({ email }, process.env.TOKEN_SECRET, {
        expiresIn: '90d',
      });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Logout route
    app.get('/logout', (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    //user verify admin after verifToken
    const verifAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log('email:', email);
      const query = { email: email };
      const user = await userCollections.findOne(query);
      res.send(user);
      const isAdmin = user?.role === 'Admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'frobidden access' });
      }
      next();
    };
    //users posts
    app.get('/all_user', verifyToken, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });
    //admin routre
    app.get('/users/role/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const result = await userCollections.findOne({ email });

        if (result) {
          res.send({ admin: result.role === 'Admin' });
        } else {
          res.status(404).send({ message: 'User not found' });
        }
      } catch (error) {
        res.status(500).send({ message: 'Server error', error: error.message });
      }
    });

    //make admin
    app.patch('/users/:id/make-admin', verifyToken, async (req, res) => {
      const userId = req.params.id;

      const result = await userCollections.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { role: 'Admin' } }
      );

      res.send(result);
    });
    app.post('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const user = req.body;

        const isExist = await userCollections.findOne(query);
        if (isExist) {
          return res.status(200).send(isExist);
        }

        const result = await userCollections.insertOne({
          ...user,
          role: 'User',
          timestamp: Date.now(),
        });

        res.status(201).send(result);
      } catch (error) {
        console.error('Error in POST /users/:email:', error.message);
        res.status(500).send({ error: 'An internal server error occurred.' });
      }
    });
    //get pets
    app.get('/managepets', verifyToken, async (req, res) => {
      const pets = await petCollections.find({}).toArray();
      res.send(pets);
    });

    // DELETE pet by ID
    app.delete('/managepetss/:id', verifyToken, async (req, res) => {
      const petId = req.params.id;
      const query = { _id: new ObjectId(petId) };
      try {
        const result = await petCollections.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to delete pet.' });
      }
    });

    app.patch('/manage-pets/:id', verifyToken, async (req, res) => {
      const petId = req.params.id;
      const updateData = req.body;

      const result = await petCollections.updateOne(
        { _id: new ObjectId(petId) },
        { $set: updateData }
      );

      res.send(result);
    });

    //post pets
    app.post('/pets', async (req, res) => {
      const pets = req.body;

      const result = await petCollections.insertOne(pets);

      res.send(result);
    });

    //get pets all data
    app.get('/all_pets', async (req, res) => {
      const { category, search, sortOrder } = req.query;
      const filter = {};
      if (category) {
        filter['category.value'] = category;
      }

      if (search) {
        filter['petName'] = { $regex: search, $options: 'i' };
      }
      let sort = {};
      if (sortOrder === 'desc') {
        sort = { date: -1 };
      } else if (sortOrder === 'age_desc') {
        sort = { age: -1 };
      }

      const result = await petCollections.find(filter).sort(sort).toArray();
      res.send(result);
    });

    //my pets

    app.get('/my-pets/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };

      const result = await petCollections.find(query).toArray();
      res.send(result);
    });
    //my pets deete
    app.delete('/mypets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await petCollections.deleteOne(query);
      res.send(result);
    });

    //pets deteails

    app.get('/pets/:details', verifyToken, async (req, res) => {
      const { details } = req.params;
      const query = { _id: new ObjectId(details) };
      const result = await petCollections.findOne(query);
      res.send(result);
    });
    //pet status changes
    app.patch('/mypets_status/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      console.log(status);

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status },
      };

      const result = await petCollections.updateOne(filter, updateDoc);

      res.send({
        result,
      });
    });
    //get the update pets
    app.get('/updatePets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await petCollections.findOne(query);
      res.send(result);
    });
    //all pets updadet
    app.patch(
      '/update-allpets/:id',
      verifyToken,

      async (req, res) => {
        try {
          const { id } = req.params;
          const { petName, age, image, location, shortDescription, category } =
            req.body;

          const updatedPet = {
            petName: petName,
            age: age ? Number(age) : 0,
            image: image,
            location: location,
            shortDescription: shortDescription,
            category: category,
          };

          const filter = { _id: new ObjectId(id) };
          const updateDoc = { $set: updatedPet };
          const result = await petCollections.updateOne(filter, updateDoc);
          console.log(result);
          if (result.matchedCount === 0) {
            return res.status(404).send({ message: 'Pet not found.' });
          }

          res.send(result);
        } catch (error) {
          console.error('Error updating pet:', error);
          res.status(500).send({ message: 'Internal server error.' });
        }
      }
    );

    //get adoption
    app.get('/adoption-request/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await adopCollections.find(query).toArray();
      res.send(result);
    });
    app.patch('/adoption-request/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const result = await adopCollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status === 'accepted' } }
      );
      res.send(result);
    });
    app.delete('/adoption/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await adopCollections.deleteOne(query);
      res.send(result);
    });
    // adoptions
    app.post('/adoptions', async (req, res) => {
      const adop = req.body;

      const result = await adopCollections.insertOne(adop);

      res.send(result);
    });

    //one pets donations
    app.get('/donation/count/:donationId', verifyToken, async (req, res) => {
      const { donationId } = req.params;

      const donations = await paymentIntentsCollection
        .find({ donationId })
        .toArray();

      res.send({
        donations,
      });
    });
    //update donation
    app.patch('/mydonation_update/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const {
        name,
        maxDonation,
        shortDescription,
        longDescription,
        lastDateDonation,
        imageUrl,
      } = req.body;
      const updatedData = {
        name,
        maxDonation,
        shortDescription,
        longDescription,
        lastDateDonation,
        imageUrl,
      };
      const result = await donationollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      console.log({ result });
      res.send({ result });
    });
    // Pause or unpause donation
    app.patch('/mydonation_pause/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const { paused } = req.body;

      try {
        // Find the current donation data
        const currentDonation = await donationollections.findOne({
          _id: new ObjectId(id),
        });

        if (currentDonation.paused === paused) {
          return res.status(200).json({
            message: 'Donation status is already set to the requested state.',
          });
        }

        // Update the paused status
        const result = await donationollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { paused } }
        );
        console.log('re', result);
        res
          .status(200)
          .json({ message: 'Donation status updated successfully', result });
      } catch (error) {
        console.error('Error updating donation pause status:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });
    //donation delete
    app.delete('/donation_delete/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationollections.deleteOne(query);
      res.send(result);
    });
    app.patch('/donation_pased/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { paused } = req.body;

      try {
        // Update the paused field in the database
        const result = await donationollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { paused } }
        );

        // If the donation was updated, send success response
        if (result.modifiedCount === 1) {
          res
            .status(200)
            .send({ message: 'Donation status updated successfully', paused });
        } else {
          res.status(400).send({ message: 'Failed to update donation status' });
        }
      } catch (error) {
        console.error('Error updating donation status:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    //get the update
    app.get('/mydonation_update/:update', verifyToken, async (req, res) => {
      const donation = req.params.update;
      const query = { _id: new ObjectId(donation) };
      const result = await donationollections.findOne(query);
      res.send(result);
    });
    //my dotantion
    app.get('/mydonation/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await donationollections.find(query).toArray();
      res.send(result);
    });
    //get donation deleteals
    app.get('/donation/:id', async (req, res) => {
      const id = req.params.id;
      if (!id || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).send({ error: 'Invalid ID format' });
      }
      try {
        const query = { _id: new ObjectId(id) };
        const result = await donationollections.findOne(query);
        if (!result) {
          return res.status(404).send({ error: 'Donation not found' });
        }
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });
    app.get(
      '/admin_all_donation',
      verifyToken,

      async (req, res) => {
        try {
          const result = await donationollections.find().toArray();
          res.send(result);
        } catch (error) {
          console.error('Error fetching donations:', error);
          res.status(500).send({ message: 'Failed to fetch donations' });
        }
      }
    );

    app.get('/donation-campaigns', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const sortOrder = req.query.sortOrder;

      let sort = {};
      if (sortOrder === 'desc') {
        sort = { date: -1 };
      } else if (sortOrder === 'age_desc') {
        sort = { maxDonation: -1 };
      }

      try {
        const donations = await donationollections
          .find()
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await donationollections.countDocuments();
        const hasNextPage = skip + limit < total;

        res.json({
          donations,
          hasNextPage,
        });
      } catch (error) {
        console.error('Error fetching donation campaigns:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.post('/donation-campaign', async (req, res) => {
      const donation = req.body;
      const result = await donationollections.insertOne(donation);
      res.send(result);
    });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    // user admin
    // app.get('/user/admin/:email', verifyToken, async (req, res) => {
    //   const email = req.params.email;
    //   if (email != req.decoded.email) {
    //     return res.status(403).send({ message: 'forbidden aaccess' });
    //   }
    //   const query = { email: email };
    //   const user = await userCollections.findOne(query);
    //   let admin = false;
    //   if (user) {
    //     admin = user.role === 'Admin';
    //   }
    //   res.send({ admin });
    // });

    //get the donationpayments
    app.get('/donation_amounts/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await paymentIntentsCollection.find(query).toArray();
      res.send(result);
    });

    // Delete donation

    // Delete donation route

    app.delete('/donationsDelete/:id', async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      // Check if the donation with the given ID exists

      const result = await paymentIntentsCollection.deleteOne(query);

      res.send(result);
    });

    // Stripe Payment Intent Endpoint

    app.post('/create-payment-intent', async (req, res) => {
      const { amount } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100,
          currency: 'usd',
        });

        // Store payment intent details in MongoDB
        const paymentIntentData = {
          amount: amount,
          clientSecret: paymentIntent.client_secret,
          createdAt: new Date(),
        };

        const result = await paymentIntentsCollection.insertOne(
          paymentIntentData
        );

        res.send({
          clientSecret: paymentIntent.client_secret,
          dbResult: result,
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.post('/donations', async (req, res) => {
      const {
        amount,
        donationId,
        paymentIntentId,
        petImage,
        petName,
        userName,
        userEmail,
        date,
      } = req.body;

      try {
        const donationData = {
          amount,
          donationId,
          paymentIntentId,
          petImage,
          petName,
          userName,
          userEmail,
          date,
        };

        const result = await paymentIntentsCollection.insertOne(donationData);

        res.send(result);
      } catch (error) {
        console.error('Error saving donation:', error);
        res.status(500).send('Internal Server Error');
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
