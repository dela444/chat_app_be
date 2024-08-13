var express = require('express')
var bcrypt = require('bcrypt')
const Yup = require('yup')
const { v4: uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')
require('dotenv').config()
var router = express.Router()

const { pool } = require('../config')

const validationSchema = Yup.object({
  username: Yup.string()
    .required('Username required')
    .min(5, 'Username too short')
    .max(35, 'Username too long!'),
  password: Yup.string()
    .required('Password required')
    .min(8, 'Password too short')
    .max(35, 'Password too long!'),
})

let auth = {
  validationCheck: async (req, res, next) => {
    const data = req.body
    try {
      const valid = await validationSchema.validate(data)
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
  },
  checkIfUserExists: (req, res, next) => {
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
  },
  registerUser: (req, res, next) => {
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
                      res.status(200).send({ authenticated: true, token })
                    }
                  }
                )
              }
            }
          )
        }
      })
    })
  },
  isUserAuthenticated: (req, res, next) => {
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
                    res.status(200).send({ authenticated: true, token })
                  }
                }
              }
            )
          }
        })
      }
    })
  },
  login: (req, res, next) => {
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
                              res
                                .status(200)
                                .send({ authenticated: true, token })
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
  },
}

router.post(
  '/register',
  auth.validationCheck,
  auth.checkIfUserExists,
  auth.registerUser
)

router.get('/check-auth', auth.isUserAuthenticated)

router.post('/login', auth.validationCheck, auth.login)

module.exports = router
