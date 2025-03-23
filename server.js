const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Redis = require("redis");

// Create Redis client
const redisClient = Redis.createClient();
const DEFAULT_EXPIRATION = 3600;

// Connect to Redis and handle connection
(async () => {
    redisClient.on('error', err => console.error('Redis Client Error', err));
    await redisClient.connect();
})();

const app = express();
app.use(express.urlencoded({ extended: true }))
app.use(cors());

app.get("/photos", async (req, res) => {
    try {
        // Try to get data from cache
        const cachedPhotos = await redisClient.get("photos");
        if (cachedPhotos) {
            return res.json(JSON.parse(cachedPhotos));
        }

        // If not in cache, fetch from API
        const { data } = await axios.get(
            "https://jsonplaceholder.typicode.com/photos",
        );

        // Store in cache
        await redisClient.setEx("photos", DEFAULT_EXPIRATION, JSON.stringify(data));

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/photos/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const hashKey = "photos:hash";

        // Try to get data from cache hash
        const cachedPhoto = await redisClient.hGet(hashKey, id);
        if (cachedPhoto) {
            return res.json(JSON.parse(cachedPhoto));
        }

        // If not in cache, fetch from API
        const { data } = await axios.get(
            `https://jsonplaceholder.typicode.com/photos/${id}`
        );

        // Store in Redis hash
        await redisClient.hSet(hashKey, id, JSON.stringify(data));
        await redisClient.expire(hashKey, DEFAULT_EXPIRATION);

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});


app.listen(3000);
console.log("Server running on port 3000");