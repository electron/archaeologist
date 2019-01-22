FROM node:8.15-jessie

COPY . /usr/src/archaelogist

CMD ["/usr/src/archaelogist/action.sh"]
