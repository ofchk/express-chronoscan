const db = require("../models");
const config = require("../config/auth.config");

const User = db.user;
const Role = db.role;

const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports.signup = (req, res) => {
  // Save User to Database
  User.create({
    username: req.body.username,
    email: req.body.email,
    password: bcrypt.hashSync(req.body.password, 8)
  })
    .then(user => {
      if (req.body.roles) {
        Role.findAll({
          where: {
            name: {
              [Op.or]: req.body.roles
            }
          }
        }).then(roles => {
          user.setRoles(roles).then(() => {
            res.send({ status: 200, id: user.id, message: "User registered successfully!" });
          });
        });
      } else {
        // user role = 1
        user.setRoles([1]).then(() => {
          res.send({ status: 200, id: user.id, message: "User registered successfully!" });
        });
      };
	    console.log()
    })
    .catch(err => {
      res.status(500).send({ message: err.message });
    });
};

exports.signin = (req, res) => {
  console.log('req', req.body)
  User.findOne({
    where: {
      username: req.body.username
    }
  })
    .then(user => {
      if (!user) {
        return res.status(404).send({ message: "User Not found." });
      }

      var passwordIsValid = bcrypt.compareSync(
        req.body.password,
        user.password
      );

      if (!passwordIsValid) {
        return res.status(401).send({
          accessToken: null,
          message: "Invalid Password!"
        });
     }
      var authorities = [];
      var hasura_roles = [];
      user.getRoles().then(roles => {
        for (let i = 0; i < roles.length; i++) {
          authorities.push("ROLE_" + roles[i].name.toUpperCase());
      	  hasura_roles.push(roles[i].name);
      	}

       const jwtClaims = {
        "sub": user.id.toString() ,
        "name": user.username ,
        "email": user.email,
        "iat": Date.now() / 1000,
       
        "https://hasura.io/jwt/claims": {
          "x-hasura-allowed-roles": hasura_roles,
          "x-hasura-default-role": roles[0].name,
          "x-hasura-role": roles[0].name,
          "x-hasura-user-id": user.id,
        }
      };

      var token = jwt.sign(jwtClaims, config.secret, {
        expiresIn: 86400 // 24 hours
      });

      res.status(200).send({token, user: {
          id: user.id,
          username: user.username,
          email: user.email,
          roles: authorities,
          accessToken: token,
	    user_role: roles[0].name
        }});

      });
    })
    .catch(err => {
      res.status(500).send({ message: err.message });
    });
};

exports.changepassword = (req, res) => {
  //  User.updateOne({username: req.body.username}, {$set: {password: bcrypt.hashSync(req.body.password, 8)}})
  //  User.query("UPDATE users SET password='" + bcrypt.hashSync(req.body.password, 8) + "' WHERE username='" +req.body.username + "'") 
    User.update({password:bcrypt.hashSync(req.body.password, 8)}, {
        where: {username: req.body.username}
    }).then(user => {
        res.send({ status: 200, message: "Password updated successfully!" });
    })
    .catch(err => {
        res.status(500).send({ message: err.message });
    });
};

exports.changerole = (req, res) => {
  console.log(req.body)
  User.findOne({
    where: {
      username: req.body.username
    }
  }).then(user => {
    if (!user) {
      return res.status(404).send({ message: "User Not found." });
    }

    if (req.body.role) {
      Role.findAll({
        where: {
          name: {
            [Op.or]: [req.body.role]
          }
        }
      }).then(roles => {
        db.sequelize.query(`DELETE user_roles from user_roles right join users on users.id=user_roles.userId where users.username="${req.body.username}"`) 
        user.setRoles(roles).then(() => {
          res.send({ status: 200, id: user.id, message: "Role updated successfully!" });
        });
        console.log(user)
      });
    }
  })
  .catch(err => {
    res.status(500).send({ message: err.message });
  });
};
