import express from 'express';
import driver from '../db/driver.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Get notifications for current user
router.get('/', verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id:$userId})-[:HAS_NOTIFICATION]->(n:Notification)-[:ABOUT]->(p:Post)
       RETURN n, p ORDER BY n.createdAt DESC LIMIT 50`,
      { userId: req.userId }
    );
    const notifications = result.records.map(r => ({
      ...r.get('n').properties,
      post: r.get('p').properties
    }));
    res.json(notifications);
  } catch (err) {
    console.error('❌ Failed to fetch notifications', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  } finally {
    await session.close();
  }
});

// Delete a notification by id (author only)
router.delete('/:notifId', verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (u:User {id:$userId})-[:HAS_NOTIFICATION]->(n:Notification {id:$notifId}) DETACH DELETE n`,
      { userId: req.userId, notifId: req.params.notifId }
    );
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('❌ Failed to delete notification', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  } finally {
    await session.close();
  }
});

export default router;
