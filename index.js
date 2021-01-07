const { ApolloServer, UserInputError, gql } = require('apollo-server')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')

mongoose.set('useFindAndModify', false)
const MONGODB_URI = 'mongodb+srv://fullstack:F1LpjDv7iNvMF2si@cluster0.emxpr.mongodb.net/graphql-book?retryWrites=true&w=majority'
mongoose.set('useCreateIndex', true)

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
	console.log('connected to MongoDB')
	// const author = new Author({
	// 	name: 'Fyodor Dostoevsky',
	// 	born: 1821
	//   })

	// await author.save()
	// await Book.deleteMany({})
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })



  const JWT_SECRET = 'SECRET_KEY'

const typeDefs = gql`
  type Book {
    title: String!
    published: Int!
    author: Author!
	id: ID!
	genres: [String!]
  }

  type Author {
    name: String!
	id: ID!
	born: Int
	bookCount: Int!
  }

  type User {
	username: String!
	favoriteGenre: String!
	id: ID!
  }

  type Token {
	value: String!
  }

  type Query {
	bookCount: Int!
	authorCount: Int!
	allBooks(author: String, genre: String): [Book!]!
	allAuthors: [Author!]!
	me: User
  }

  type Mutation {
	addBook(
		title: String!
		published: Int!
		author: String!
		genres: [String!]
	): Book
	editAuthor(
		name: String!
		born: Int!
	): Author
	createUser(
		username: String!
		favoriteGenre: String!
	): User
	login(
		username: String!
		password: String!
	): Token
  }
`

const authorPopulated = async authorId => {
	try {
		return await Author.findById(authorId)
	} catch (err) {
		throw new UserInputError(error.message, {
			invalidArgs: authorId,
		})
	}
  }

const resolvers = {
  Query: {
	  bookCount: () => Book.collection.countDocuments(),
	  authorCount: () => Author.collection.countDocuments(),
	  allBooks: async (root, args) => {
        // if (!args.author && !args.genre) {}
			try {
				const books = await Book.find()
				const filtedBooksByGenre = !args.genre? books: books.filter(b => b.genres.includes(args.genre))
				return filtedBooksByGenre.map(book => ({
					...book._doc,
					author: authorPopulated.bind(this, book._doc.author)
				}))
			  } catch (error) {
				throw new UserInputError(error.message, {
				  invalidArgs: args,
				})
			  }

	  },
	  allAuthors: () => Author.find({}),
	  me: (root, args, context) => {
		 return context.currentUser
	  }
  },
  Author: {
	bookCount: async (root) => {
		const booksWrittenByAuthor = await Book.find({author: {$in: [root._id]}})
		const booksLength = booksWrittenByAuthor.length ? booksWrittenByAuthor.length : 0
		return booksLength
	}
  },
  Mutation: {
    addBook: async (root, args, context) => {
	  const book = new Book({ ...args })
	  const currentUser = context.currentUser

	  if (!currentUser) {
        throw new AuthenticationError("not authenticated")
	  }

	  try {
		const savedBook = await book.save()
		const authorRecord = await Author.findById(args.author)
		await authorRecord.save()
		return {
			...savedBook._doc,
			author: authorPopulated.bind(this, args.author)
		}
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
	  }
	},
	editAuthor: async (root, args, context) => {
		const author = await Author.findOne({ name:args.name })
		const currentUser = context.currentUser

		if (!currentUser) {
			throw new AuthenticationError("not authenticated")
		}

		author.born = args.born
		try {
			await author.save()
		} catch (error) {
			throw new UserInputError(error.message, {
			  invalidArgs: args,
			})
		}
		return author
	},
	createUser: (root, args) => {
		const user = new User({ ...args })

		return user.save()
		  .catch(error => {
			throw new UserInputError(error.message, {
			  invalidArgs: args,
			})
		})
	},
	login: async (root, args) => {
		const user = await User.findOne({ username: args.username })

		if ( !user || args.password !== 'secred' ) {
		  throw new UserInputError("wrong credentials")
		}

		const userForToken = {
		  username: user.username,
		  id: user._id,
		}

		return { value: jwt.sign(userForToken, JWT_SECRET) }
	},
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
	const auth = req ? req.headers.authorization : null
	if (auth && auth.toLowerCase().startsWith('bearer ')) {
	  const decodedToken = jwt.verify(
		auth.substring(7), JWT_SECRET
	  )
	  const currentUser = await User.findById(decodedToken.id)
	  return { currentUser }
	}
  }
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})