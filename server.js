require('dotenv').config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const Redis = require("redis");
const compression = require("compression");

const redisClient = Redis.createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: 'redis-11871.c339.eu-west-3-1.ec2.redns.redis-cloud.com',
        port: 11871
    }
});
// Create Redis client
const DEFAULT_EXPIRATION = 3600;

// Connect to Redis and handle connection
(async () => {
    try {
        redisClient.on('error', err => console.error('Redis Client Error', err));
        redisClient.on('connect', () => console.log('Redis Client Connected'));
        await redisClient.connect();
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        process.exit(1);
    }
})();

const app = express();
app.use(compression());
app.use(express.urlencoded({ extended: true }))
app.use(express.json());

app.use(cors());

app.get("/photos", async (req, res) => {
    try {
        // Try to get data from cache
        const cachedPhotos = await redisClient.get("photos");
        if (cachedPhotos) {
            return res.json(JSON.parse(cachedPhotos));
        }

        // Fetch from API
        const { data } = await axios.get("https://jsonplaceholder.typicode.com/photos");

        // Respond to client immediately
        res.json(data);

        // Store in Redis asynchronously (no need to wait)
        redisClient.setEx("photos", DEFAULT_EXPIRATION, JSON.stringify(data))
            .catch(err => console.error("Failed to cache data in Redis:", err));

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/photos/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const cacheKey = `photo:${id}`;  // Unique key for each photo

        // Try to get data from cache
        const cachedPhoto = await redisClient.get(cacheKey);
        if (cachedPhoto) {
            console.log(`[${Date.now()}] Cache hit for photo ${id}`);
            return res.json(JSON.parse(cachedPhoto));
        }

        // If not in cache, fetch from API
        const { data } = await axios.get(`https://jsonplaceholder.typicode.com/photos/${id}`);

        // Respond to client immediately
        res.json(data);

        // Cache the data in Redis asynchronously (after response)
        res.on("finish", async () => {
            try {
                await redisClient.setEx(cacheKey, DEFAULT_EXPIRATION, JSON.stringify(data));
                console.log(`[${Date.now()}] Data cached for photo ${id}`);
            } catch (err) {
                console.error("Failed to cache photo:", err);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});


process.on('SIGINT', async () => {
    await redisClient.quit();
    console.log("Redis client disconnected. Server shutting down.");
    process.exit(0);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));