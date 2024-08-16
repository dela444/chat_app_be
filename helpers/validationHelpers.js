const Yup = require('yup')

const userValidationSchema = Yup.object({
  username: Yup.string()
    .required('Username is a required field!')
    .min(5, 'Username too short')
    .max(35, 'Username too long!'),
  password: Yup.string()
    .required('Password is a required field!')
    .min(8, 'Password too short')
    .max(35, 'Password too long!'),
})

const roomValidationSchema = Yup.object({
  name: Yup.string()
    .required('Name is a required field!')
    .min(5, 'Name is too short!')
    .max(35, 'Name is too long!'),
})

const messageValidationSchema = Yup.object({
  message: Yup.string().required().min(1).max(255),
  from: Yup.string().required().min(1),
  recipient_id: Yup.string().required().min(1),
  recipient_type: Yup.string().required(),
})

module.exports = {
  userValidationSchema,
  roomValidationSchema,
  messageValidationSchema,
}
