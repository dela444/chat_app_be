var bcrypt = require('bcrypt')
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const { pool } = require('../config')
const {
  storeUsersToRedis,
  storeUserToRedis,
} = require('../helpers/redisHelpers')
const { userValidationSchema } = require('../helpers/validationHelpers')

const userValidationCheck = async (req, res, next) => {
  const data = req.body
  try {
    const valid = await userValidationSchema.validate(data)
    if (valid) {
      next()
    } else {
      res
        .status(422)
        .send({ authenticated: false, message: 'Invalid credentials' })
    }
  } catch (error) {
    res
      .status(422)
      .send({ authenticated: false, message: 'Invalid credentials' })
  }
}

const isUsernameTaken = (req, res, next) => {
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `SELECT * FROM chat_users WHERE username=$1;`,
        [req.body.username],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            if (result.rows.length === 0) {
              next()
            } else {
              res.send({
                authenticated: false,
                message: 'Username is already taken!',
              })
            }
          }
        }
      )
    }
  })
}

const registerUser = (req, res, next) => {
  bcrypt.hash(req.body.password, 10, function (err, hash) {
    pool.connect(function (err, client, done) {
      if (err) {
        return next(err)
      } else {
        client.query(
          `INSERT INTO chat_users (username, password, user_id) VALUES ($1,$2,$3) RETURNING id, username, user_id;`,
          [req.body.username, hash, uuidv4()],
          function (err, result) {
            done()
            if (err) {
              return next(err)
            } else {
              jwt.sign(
                {
                  username: req.body.username,
                  id: result.rows[0].id,
                  userid: result.rows[0].user_id,
                },
                process.env.JWT_SECRET,
                { expiresIn: '1d' },
                (err, token) => {
                  if (err) {
                    res.status(500).send({
                      authenticated: false,
                      message: 'An error occurred, please try again later',
                    })
                    return
                  } else {
                    storeUsersToRedis({
                      user_id: result.rows[0].user_id,
                      username: req.body.username,
                    })
                    storeUserToRedis({
                      user_id: result.rows[0].user_id,
                      username: req.body.username,
                    })
                    res.status(200).send({
                      authenticated: true,
                      token,
                      username: req.body.username,
                    })
                  }
                }
              )
            }
          }
        )
      }
    })
  })
}

const isUserAuthenticated = (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.send({
      authenticated: false,
      message: 'Invalid Authorization header',
    })
  }
  const token = authHeader.split(' ')[1]
  if (!token || token === 'null') {
    return res.send({
      authenticated: false,
      message: 'Invalid Authorization header',
    })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(500).send({
        authenticated: false,
        message: 'An error occurred, please try again later',
      })
      return
    } else {
      pool.connect(function (err, client, done) {
        if (err) {
          return next(err)
        } else {
          client.query(
            `SELECT * FROM chat_users WHERE username=$1;`,
            [decoded.username],
            function (err, result) {
              done()
              if (err) {
                return next(err)
              } else {
                if (result.rows.length === 0) {
                  res.send({ authenticated: false, token: null })
                  return
                } else {
                  res.status(200).send({
                    authenticated: true,
                    token,
                    username: result.rows[0].username,
                  })
                }
              }
            }
          )
        }
      })
    }
  })
}

const login = (req, res, next) => {
  pool.connect(function (err, client, done) {
    if (err) {
      return next(err)
    } else {
      client.query(
        `SELECT * FROM chat_users WHERE username = $1`,
        [req.body.username],
        function (err, result) {
          done()
          if (err) {
            return next(err)
          } else {
            if (result.rows.length > 0) {
              bcrypt.compare(
                req.body.password,
                result.rows[0].password,
                function (err, r) {
                  if (err) {
                    return next(err)
                  } else {
                    if (r) {
                      jwt.sign(
                        {
                          username: req.body.username,
                          id: result.rows[0].id,
                          userid: result.rows[0].user_id,
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: '1d' },
                        (err, token) => {
                          if (err) {
                            console.log(err)
                            res.status(500).send({
                              authenticated: false,
                              message:
                                'An error occurred, please try again later',
                            })
                            return
                          } else {
                            storeUserToRedis({
                              user_id: result.rows[0].user_id,
                              username: req.body.username,
                            })
                            res.status(200).send({
                              authenticated: true,
                              token,
                              username: req.body.username,
                            })
                          }
                        }
                      )
                    } else {
                      res.send({
                        authenticated: false,
                        message: 'Wrong username or password!',
                      })
                    }
                  }
                }
              )
            } else {
              res.send({
                authenticated: false,
                message: 'Wrong username or password!',
              })
            }
          }
        }
      )
    }
  })
}

module.exports = {
  userValidationCheck,
  isUsernameTaken,
  registerUser,
  isUserAuthenticated,
  login,
}
